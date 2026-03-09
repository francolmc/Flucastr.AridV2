import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { ToolExecutionError } from '../utils/errors.js';
import { SecurityValidator } from './security-validator.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * CommandExecutor - Ejecuta comandos shell con seguridad extrema
 *
 * Responsabilidades:
 * - Validar comandos contra lista negra
 * - Ejecutar con timeout y límites
 * - Sanitizar environment variables
 * - Capturar stdout/stderr
 *
 * COMPONENTE CRÍTICO DE SEGURIDAD
 */
export class CommandExecutor {
  private readonly securityValidator: SecurityValidator;
  private readonly workingDirectory: string;
  private readonly TIMEOUT_MS = 30000; // 30 segundos
  private readonly MAX_BUFFER = 1024 * 1024; // 1MB

  constructor(workingDirectory: string) {
    this.securityValidator = new SecurityValidator();
    this.workingDirectory = workingDirectory;

    logger.info('CommandExecutor initialized', {
      workingDirectory: this.workingDirectory,
      timeout: this.TIMEOUT_MS,
      maxBuffer: this.MAX_BUFFER,
    });
  }

  /**
   * Ejecuta un comando shell de forma segura
   * @param command El comando a ejecutar
   * @returns stdout del comando
   * @throws ToolExecutionError si el comando es peligroso o falla
   */
  async executeCommand(command: string): Promise<string> {
    logger.info('Executing command', { command });

    // VALIDACIÓN DE SEGURIDAD CRÍTICA
    try {
      this.securityValidator.validateCommand(command);
    } catch (error) {
      logger.error('Command validation failed', { command, error });
      throw error;
    }

    // Sanitizar environment variables (no exponer API keys)
    const sanitizedEnv = this.securityValidator.sanitizeEnv(process.env);

    // Ejecutar con timeout y límites
    try {
      const startTime = Date.now();

      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workingDirectory,
        timeout: this.TIMEOUT_MS,
        maxBuffer: this.MAX_BUFFER,
        env: sanitizedEnv,
        shell: '/bin/bash',
      });

      const duration = Date.now() - startTime;

      logger.info('Command executed successfully', {
        command,
        durationMs: duration,
        stdoutLength: stdout.length,
        stderrLength: stderr.length,
      });

      // Combinar stdout y stderr si hay ambos
      let output = stdout.trim();
      if (stderr.trim()) {
        output += stderr.trim() ? `\n\nSTDERR:\n${stderr.trim()}` : '';
      }

      return output || '(comando ejecutado sin output)';
    } catch (error: any) {
      // Manejar errores de ejecución
      if (error.killed) {
        throw new ToolExecutionError(
          `El comando excedió el tiempo límite de ${this.TIMEOUT_MS / 1000}s y fue terminado.`
        );
      }

      if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
        throw new ToolExecutionError(
          `El comando generó demasiado output (límite: ${this.MAX_BUFFER / 1024 / 1024}MB).`
        );
      }

      // Error de ejecución normal (exit code != 0)
      const errorMessage = error.stderr || error.stdout || error.message;
      throw new ToolExecutionError(
        `Error ejecutando comando: ${errorMessage.trim()}`
      );
    }
  }

  /**
   * Obtiene información sobre el working directory
   */
  getWorkingDirectory(): string {
    return this.workingDirectory;
  }
}
