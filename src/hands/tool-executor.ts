import { ToolAction } from './tool-actions.store.js';
import { CommandExecutor } from './command-executor.js';
import { FileManager } from './file-manager.js';
import { WebSearcher } from './web-searcher.js';
import { ToolExecutionError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface ExecutionResult {
  success: boolean;
  output: string;
  executedAt: Date;
  durationMs: number;
}

/**
 * ToolExecutor - Orquesta la ejecución de herramientas
 *
 * Responsabilidades:
 * - Delegar a executor específico según action
 * - Medir duración de ejecución
 * - Capturar errores y retornar ExecutionResult
 */
export class ToolExecutor {
  private readonly commandExecutor: CommandExecutor;
  private readonly fileManager: FileManager;
  private readonly webSearcher: WebSearcher;

  constructor(
    workspacePath: string,
    tavilyApiKey?: string
  ) {
    this.commandExecutor = new CommandExecutor(workspacePath);
    this.fileManager = new FileManager(workspacePath);
    this.webSearcher = new WebSearcher(tavilyApiKey);

    logger.info('ToolExecutor initialized', {
      workspacePath,
      webSearchConfigured: this.webSearcher.isConfigured(),
    });
  }

  /**
   * Ejecuta una herramienta
   * @param action Tipo de acción
   * @param targetResource Recurso objetivo (path, comando, query)
   * @param parameters Parámetros adicionales
   * @returns Resultado de la ejecución
   */
  async execute(
    action: ToolAction,
    targetResource: string,
    parameters?: Record<string, any>
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    logger.info('Executing tool', {
      action,
      targetResource,
      parameters,
    });

    try {
      let output: string;

      switch (action) {
        case 'execute_command':
          output = await this.commandExecutor.executeCommand(targetResource);
          break;

        case 'read_file':
          output = await this.fileManager.readFile(targetResource);
          break;

        case 'write_file': {
          const content = parameters?.content as string;
          if (!content) {
            throw new ToolExecutionError(
              'El parámetro "content" es requerido para write_file.'
            );
          }
          await this.fileManager.writeFile(targetResource, content);
          output = `Archivo "${targetResource}" escrito exitosamente.`;
          break;
        }

        case 'list_directory':
          const entries = await this.fileManager.listDirectory(targetResource);
          output = `Contenido de "${targetResource}":\n\n${entries.join('\n')}`;
          break;

        case 'web_search':
          output = await this.webSearcher.search(targetResource);
          break;

        default:
          throw new ToolExecutionError(
            `Acción desconocida: ${action}`
          );
      }

      const durationMs = Date.now() - startTime;

      logger.info('Tool executed successfully', {
        action,
        targetResource,
        durationMs,
        outputLength: output.length,
      });

      return {
        success: true,
        output,
        executedAt: new Date(),
        durationMs,
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      logger.error('Tool execution failed', {
        action,
        targetResource,
        error: error.message,
        durationMs,
      });

      // Si es ToolExecutionError, ya tiene un mensaje descriptivo
      if (error instanceof ToolExecutionError) {
        return {
          success: false,
          output: error.message,
          executedAt: new Date(),
          durationMs,
        };
      }

      // Error inesperado
      return {
        success: false,
        output: `Error ejecutando herramienta: ${error.message}`,
        executedAt: new Date(),
        durationMs,
      };
    }
  }
}
