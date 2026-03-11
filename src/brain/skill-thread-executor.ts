import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { BackgroundExecutor } from '../hands/background-executor.js';
import { SkillCommandDetector } from './skill-command-detector.js';
import { ParsedSkill } from './skill-loader.js';
import { ConversationMessage } from '../config/types.js';

/**
 * Estado de ejecución de un paso dentro de un hilo de skill
 */
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * Resultado de la ejecución de un paso
 */
export interface StepResult {
  stepNumber: number;
  command: string;
  status: StepStatus;
  output?: string;
  error?: string;
  duration?: number;
  retryCount: number;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Hilo de ejecución de un skill con múltiples pasos
 */
export interface SkillThread {
  id: string;
  userId: string;
  skillName: string;
  conversationId?: string;
  steps: StepResult[];
  currentStep: number;
  status: 'running' | 'completed' | 'failed' | 'paused';
  startedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, any>; // Context para pasar entre pasos
}

/**
 * SkillThreadExecutor - Ejecuta skills con múltiples pasos secuenciales (Fase 10)
 *
 * Responsabilidades:
 * - Parsear skills con pasos numerados (## Paso 1, ## Paso 2, etc)
 * - Ejecutar pasos en orden manteniendo contexto
 * - Reintentos automáticos con backoff exponencial
 * - Persistencia de estado en DB
 * - Permitir pausa/resume de hilos
 * - Interpolación de variables entre pasos (output del paso anterior)
 *
 * Flujo:
 * 1. Usuario pide ejecutar skill con múltiples pasos
 * 2. SkillThreadExecutor parsea SKILL.md identificando pasos
 * 3. Crea thread record con estado "running"
 * 4. Ejecuta paso 1, almacena output
 * 5. Si éxito → siguiente paso; Si error → reintentos con backoff
 * 6. Después del último paso → marca thread como "completed"
 * 7. Usuario puede consultar progreso en cualquier momento
 */
export class SkillThreadExecutor {
  private readonly backgroundExecutor: BackgroundExecutor;
  private readonly commandDetector: SkillCommandDetector;
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_BACKOFF_MS = 1000; // 1 segundo
  private readonly MAX_BACKOFF_MS = 30000; // 30 segundos

  private activeThreads: Map<string, SkillThread> = new Map();
  private threadPersistence: Map<string, SkillThread> = new Map(); // TODO: Reemplazar con DB

  constructor(workingDirectory: string) {
    this.backgroundExecutor = new BackgroundExecutor(workingDirectory);
    this.commandDetector = new SkillCommandDetector();

    logger.info('SkillThreadExecutor initialized');
  }

  /**
   * Inicia ejecución de un skill con múltiples pasos
   * Retorna threadId para tracking
   */
  async executeSkillThread(
    userId: string,
    skillName: string,
    skill: ParsedSkill,
    conversationId?: string
  ): Promise<string> {
    const threadId = uuidv4();

    // Parsear pasos del skill
    const steps = this.parseSkillSteps(skill.instructions);

    if (steps.length === 0) {
      throw new Error(`Skill "${skillName}" no contiene pasos numerados para ejecutar`);
    }

    // Crear thread
    const thread: SkillThread = {
      id: threadId,
      userId,
      skillName,
      conversationId,
      steps: steps.map((_, idx) => ({
        stepNumber: idx + 1,
        command: steps[idx],
        status: 'pending' as StepStatus,
        retryCount: 0,
        startedAt: new Date(),
      })),
      currentStep: 0,
      status: 'running',
      startedAt: new Date(),
      metadata: {},
    };

    this.activeThreads.set(threadId, thread);
    this.threadPersistence.set(threadId, thread);

    logger.info('Skill thread started', {
      threadId,
      userId,
      skillName,
      totalSteps: steps.length,
    });

    // Ejecutar pasos en background (no bloquear)
    this.executeStepsSequentially(thread).catch((error) => {
      logger.error('Skill thread execution error', { threadId, error });
      thread.status = 'failed';
    });

    return threadId;
  }

  /**
   * Obtiene el estado actual de un hilo
   */
  async getThreadStatus(userId: string, threadId: string): Promise<SkillThread | null> {
    const thread = this.activeThreads.get(threadId) || this.threadPersistence.get(threadId);

    if (!thread || thread.userId !== userId) {
      return null;
    }

    return thread;
  }

  /**
   * Lista hilos de un usuario (solo los últimos 20)
   */
  async listUserThreads(userId: string): Promise<SkillThread[]> {
    const userThreads = Array.from(this.threadPersistence.values()).filter((t) => t.userId === userId);

    return userThreads.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 20);
  }

  /**
   * Pausa la ejecución de un hilo en el paso actual
   */
  async pauseThread(userId: string, threadId: string): Promise<void> {
    const thread = this.activeThreads.get(threadId);

    if (!thread || thread.userId !== userId) {
      throw new Error(`Hilo ${threadId} no encontrado`);
    }

    if (thread.status !== 'running') {
      throw new Error(`No se puede pausar hilo con status: ${thread.status}`);
    }

    thread.status = 'paused';

    logger.info('Thread paused', {
      threadId,
      userId,
      currentStep: thread.currentStep,
    });
  }

  /**
   * Reanuda la ejecución de un hilo pausado
   */
  async resumeThread(userId: string, threadId: string): Promise<void> {
    const thread = this.threadPersistence.get(threadId);

    if (!thread || thread.userId !== userId) {
      throw new Error(`Hilo ${threadId} no encontrado`);
    }

    if (thread.status !== 'paused') {
      throw new Error(`Hilo no está pausado (status: ${thread.status})`);
    }

    thread.status = 'running';
    this.activeThreads.set(threadId, thread);

    logger.info('Thread resumed', {
      threadId,
      userId,
    });

    // Reanudar ejecución en background
    this.executeStepsSequentially(thread).catch((error) => {
      logger.error('Skill thread execution error after resume', { threadId, error });
      thread.status = 'failed';
    });
  }

  /**
   * Obtiene resultados detallados de un paso
   */
  async getStepResult(userId: string, threadId: string, stepNumber: number): Promise<StepResult | null> {
    const thread = await this.getThreadStatus(userId, threadId);

    if (!thread) {
      return null;
    }

    return thread.steps.find((s) => s.stepNumber === stepNumber) || null;
  }

  /**
   * Parsea el SKILL.md para extraer pasos numerados
   * Busca patrones: ## Paso 1, ### Step 1, ## 1. [description]
   */
  private parseSkillSteps(instructions: string): string[] {
    const steps: string[] = [];

    // Regex para detectar pasos numerados: ## Paso 1, ### Step 1, ## 1. ...
    const stepRegex = /^#+\s*(?:paso|step)?\s*(\d+)[\.\):-]?\s*(.+?)$/gim;

    // Dividir por pasos
    const sections = instructions.split(/^#+\s*(?:paso|step)?/im);

    for (let i = 1; i < sections.length; i++) {
      const section = sections[i].trim();

      // Buscar bloques de código
      const codeMatch = section.match(/```(?:bash|shell)\n([\s\S]*?)```/);
      if (codeMatch) {
        const command = codeMatch[1].trim();
        if (command) {
          steps.push(command);
        }
      } else {
        // Si no hay código bash, buscar comandos mencionados
        const cmdMatch = section.match(/^\s*\d+[\.\):-]?\s*(.+?)(?:\n|$)/m);
        if (cmdMatch) {
          const possibleCmd = cmdMatch[1].trim();
          if (possibleCmd.length > 10) {
            // Parece ser un comando legítimo
            steps.push(possibleCmd);
          }
        }
      }
    }

    return steps;
  }

  /**
   * Ejecuta los pasos secuencialmente
   * Maneja reintentos y persiste estado
   */
  private async executeStepsSequentially(thread: SkillThread): Promise<void> {
    while (thread.currentStep < thread.steps.length) {
      // Verificar si pausado
      if (thread.status === 'paused') {
        logger.info('Thread execution paused', { threadId: thread.id, currentStep: thread.currentStep });
        return;
      }

      const stepResult = thread.steps[thread.currentStep];

      logger.info('Executing step', {
        threadId: thread.id,
        step: stepResult.stepNumber,
        command: stepResult.command.substring(0, 100),
      });

      stepResult.status = 'running';
      stepResult.startedAt = new Date();

      try {
        // Ejecutar comando
        const output = await this.backgroundExecutor.executeInBackground(
          stepResult.command,
          thread.userId,
          `${thread.skillName}-step-${stepResult.stepNumber}`
        );

        stepResult.status = 'completed';
        stepResult.output = output;
        stepResult.completedAt = new Date();
        stepResult.duration = stepResult.completedAt.getTime() - stepResult.startedAt.getTime();

        // Almacenar output en metadata para pasos siguientes
        thread.metadata = thread.metadata || {};
        thread.metadata[`step_${stepResult.stepNumber}_output`] = output;

        logger.info('Step completed successfully', {
          threadId: thread.id,
          step: stepResult.stepNumber,
          duration: stepResult.duration,
        });

        thread.currentStep++;
      } catch (error: any) {
        logger.error('Step execution failed', {
          threadId: thread.id,
          step: stepResult.stepNumber,
          error: error.message,
          retryCount: stepResult.retryCount,
        });

        // Reintentos con backoff exponencial
        if (stepResult.retryCount < this.MAX_RETRIES) {
          const backoffMs = Math.min(
            this.INITIAL_BACKOFF_MS * Math.pow(2, stepResult.retryCount),
            this.MAX_BACKOFF_MS
          );

          stepResult.retryCount++;

          logger.info('Retrying step', {
            threadId: thread.id,
            step: stepResult.stepNumber,
            retryCount: stepResult.retryCount,
            backoffMs,
          });

          // Esperar antes de reintentar
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          // No incrementar currentStep, reintentar este paso
          continue;
        } else {
          // Max retries alcanzados
          stepResult.status = 'failed';
          stepResult.error = error.message;
          stepResult.completedAt = new Date();
          stepResult.duration = stepResult.completedAt.getTime() - stepResult.startedAt.getTime();

          thread.status = 'failed';
          thread.completedAt = new Date();

          logger.error('Step failed after max retries', {
            threadId: thread.id,
            step: stepResult.stepNumber,
            maxRetries: this.MAX_RETRIES,
          });

          return; // Detener ejecución
        }
      }
    }

    // Todos los pasos completaron
    thread.status = 'completed';
    thread.completedAt = new Date();

    logger.info('Skill thread completed', {
      threadId: thread.id,
      skillName: thread.skillName,
      totalSteps: thread.steps.length,
      duration: thread.completedAt.getTime() - thread.startedAt.getTime(),
    });

    // Remover de activeThreads pero mantener en persistencia
    this.activeThreads.delete(thread.id);
  }

  /**
   * Obtiene resumen del progreso
   */
  async getThreadSummary(userId: string, threadId: string): Promise<{
    progress: number; // 0-100
    totalSteps: number;
    completedSteps: number;
    currentStep: number;
    failedSteps: number;
    status: string;
  } | null> {
    const thread = await this.getThreadStatus(userId, threadId);

    if (!thread) {
      return null;
    }

    const completedSteps = thread.steps.filter((s) => s.status === 'completed').length;
    const failedSteps = thread.steps.filter((s) => s.status === 'failed').length;

    return {
      progress: Math.round((completedSteps / thread.steps.length) * 100),
      totalSteps: thread.steps.length,
      completedSteps,
      currentStep: thread.currentStep + 1,
      failedSteps,
      status: thread.status,
    };
  }
}
