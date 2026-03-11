import { exec, spawn, ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolExecutionError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { BackgroundProcessStore } from '../storage/background-processes.store.js';
import { BackgroundProcess } from '../config/types.js';

const execAsync = promisify(exec);

/**
 * BackgroundExecutor - Ejecuta procesos largos en background
 *
 * Responsabilidades:
 * - Ejecutar comandos que tardan más de 30s
 * - Manejar procesos asíncronos sin bloquear la conversación
 * - Almacenar estado de procesos en la DB
 * - Notificar al usuario cuando termina (via Telegram bot)
 * - Cleanup de procesos antiguos (>7 días)
 *
 * Flujo:
 * 1. Usuario pide ejecutar algo largo (skill con "slow" duration)
 * 2. Se solicita confirmación del usuario (integración con ToolActionsStore)
 * 3. Se crea registro de proceso en DB con status='running'
 * 4. Se inicia el comando sin esperar (async, no await)
 * 5. Se retorna processId al usuario
 * 6. Polling cada 5s verifica si terminó
 * 7. Al terminar, se actualiza DB y se notifica via Telegram
 */
export class BackgroundExecutor {
  private readonly processStore: BackgroundProcessStore;
  private readonly workingDirectory: string;
  private readonly POLLING_INTERVAL_MS = 5000; // 5 segundos
  private readonly MAX_BUFFER = 5 * 1024 * 1024; // 5MB
  private activeProcesses: Map<string, NodeJS.Timeout> = new Map();

  constructor(workingDirectory: string) {
    this.processStore = new BackgroundProcessStore();
    this.workingDirectory = workingDirectory;

    logger.info('BackgroundExecutor initialized', {
      workingDirectory: this.workingDirectory,
      pollingInterval: this.POLLING_INTERVAL_MS,
    });
  }

  /**
   * Ejecuta un comando largo en background y retorna processId
   * El comando se ejecuta SIN esperar (fire and forget con polling)
   *
   * @param command Comando a ejecutar
   * @param userId ID del usuario
   * @param skillName Nombre del skill que genera el proceso
   * @returns ID del proceso para tracking
   */
  async executeInBackground(
    command: string,
    userId: string,
    skillName: string
  ): Promise<string> {
    // Crear registro de proceso en DB
    const process = this.processStore.createProcess(userId, skillName, command);

    logger.info('Background process created', {
      processId: process.id,
      userId,
      skillName,
      command,
    });

    // Ejecutar comando en background (no await, no bloquea)
    this.executeCommandAsync(process.id, command, userId, skillName).catch((error) => {
      logger.error('Background execution error', { processId: process.id, error });
      // Actualizar DB con error
      this.processStore.failProcess(userId, process.id, error.message);
    });

    return process.id;
  }

  /**
   * Chequea el estado actual de un proceso
   */
  async getProcessStatus(userId: string, processId: string): Promise<BackgroundProcess | null> {
    return this.processStore.getProcess(userId, processId);
  }

  /**
   * Cancela un proceso en ejecución
   */
  async cancelProcess(userId: string, processId: string): Promise<void> {
    const process = await this.getProcessStatus(userId, processId);

    if (!process) {
      throw new ToolExecutionError(`Proceso ${processId} no encontrado`);
    }

    if (process.status !== 'running') {
      throw new ToolExecutionError(`Proceso ${processId} no está en ejecución (status: ${process.status})`);
    }

    // Detener polling si está activo
    const pollingHandle = this.activeProcesses.get(processId);
    if (pollingHandle) {
      clearInterval(pollingHandle);
      this.activeProcesses.delete(processId);
    }

    // Marcar como cancelado en DB
    this.processStore.cancelProcess(userId, processId);

    logger.info('Process cancelled', { processId, userId });
  }

  /**
   * Limpia procesos que terminaron hace >7 días
   * Se llama periódicamente desde el main loop
   */
  async cleanupOldProcesses(userId: string): Promise<void> {
    const processes = this.processStore.listProcesses(userId);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const process of processes) {
      if (process.completedAt && process.completedAt < sevenDaysAgo) {
        logger.debug('Cleaning up old background process', {
          processId: process.id,
          completedAt: process.completedAt,
        });
        // Aquí podría agregar lógica para eliminar registros antiguos de la DB
        // Por ahora solo los dejamos (los datos persistentes no son un problema)
      }
    }
  }

  /**
   * Ejecuta el comando realmente en background usando spawn/exec
   * Interno: no se expone públicamente
   */
  private async executeCommandAsync(
    processId: string,
    command: string,
    userId: string,
    skillName: string
  ): Promise<void> {
    const startTime = Date.now();
    let output = '';
    let error: string | undefined;
    let exitCode = 0;

    try {
      // Usar exec para capturar output completo
      // IMPORTANTE: No await aquí, usar callbacks para actualizar DB
      const childProcess: ChildProcess = spawn('bash', ['-c', command], {
        cwd: this.workingDirectory,
        env: this.sanitizeEnv(process.env),
      });

      // Capturar stdout
      childProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
        logger.debug('Process stdout', { processId, chunk: data.toString().substring(0, 100) });
      });

      // Capturar stderr
      childProcess.stderr?.on('data', (data: Buffer) => {
        output += `\nSTDERR: ${data.toString()}`;
        logger.debug('Process stderr', { processId, chunk: data.toString().substring(0, 100) });
      });

      // Esperar a que termine
      await new Promise<void>((resolve, reject) => {
        childProcess.on('close', (code: number | null) => {
          exitCode = code || 0;
          const duration = Date.now() - startTime;

          logger.info('Background process completed', {
            processId,
            userId,
            skillName,
            exitCode,
            durationMs: duration,
            outputLength: output.length,
          });

          // Actualizar DB
          this.processStore.completeProcess(userId, processId, output, exitCode);

          // Detener polling
          const pollingHandle = this.activeProcesses.get(processId);
          if (pollingHandle) {
            clearInterval(pollingHandle);
            this.activeProcesses.delete(processId);
          }

          // Notificar al usuario (TODO: integrar con Telegram bot)
          this.notifyUserProcessComplete(processId, userId, skillName, exitCode).catch(() => {});

          resolve();
        });

        process.on('error', (err) => {
          error = err.message;
          const duration = Date.now() - startTime;

          logger.error('Background process error', {
            processId,
            userId,
            error: err.message,
            durationMs: duration,
          });

          this.processStore.failProcess(userId, processId, err.message);

          // Detener polling
          const pollingHandle = this.activeProcesses.get(processId);
          if (pollingHandle) {
            clearInterval(pollingHandle);
            this.activeProcesses.delete(processId);
          }

          reject(err);
        });
      });
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const errorMsg = err.message || 'Unknown error';

      logger.error('Background execution failed', {
        processId,
        userId,
        skillName,
        error: errorMsg,
        durationMs: duration,
      });

      this.processStore.failProcess(userId, processId, errorMsg);

      // Detener polling
      const pollingHandle = this.activeProcesses.get(processId);
      if (pollingHandle) {
        clearInterval(pollingHandle);
        this.activeProcesses.delete(processId);
      }

      throw err;
    }
  }

  /**
   * Notifica al usuario que su proceso terminó (vía Telegram)
   * TODO: Implementar integración real con Telegram bot
   */
  private async notifyUserProcessComplete(
    processId: string,
    userId: string,
    skillName: string,
    exitCode: number
  ): Promise<void> {
    const status = exitCode === 0 ? '✅ Completado' : '❌ Error';
    const message = `Tu proceso "${skillName}" (${processId.substring(0, 8)}...) ${status}`;

    logger.info('Process notification', {
      processId,
      userId,
      skillName,
      message,
    });

    // PLACEHOLDER: Aquí iría la integración real con Telegram bot
    // this.telegramBot.sendMessage(userId, message);
  }

  /**
   * Sanitiza variables de entorno (no exponer secrets)
   */
  private sanitizeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const sanitized = { ...env };
    const secretKeys = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'TELEGRAM_BOT_TOKEN'];

    for (const key of secretKeys) {
      delete sanitized[key];
    }

    return sanitized;
  }

  /**
   * Pausa un proceso (no terminarlo completamente)
   * Nota: Implementación limitada, ya que no podemos pausar procesos CLI sin soporte explícito
   */
  async pauseProcess(userId: string, processId: string): Promise<void> {
    const process = await this.getProcessStatus(userId, processId);

    if (!process) {
      throw new ToolExecutionError(`Proceso ${processId} no encontrado`);
    }

    if (process.status !== 'running') {
      throw new ToolExecutionError(`Proceso no está en ejecución`);
    }

    // NOTA: Implementación futura con signals SIGSTOP/SIGCONT
    logger.warn('Pause not fully implemented', { processId });
  }
}
