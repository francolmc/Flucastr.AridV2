import { logger } from '../utils/logger.js';
import { TaskQueueStore } from '../storage/task-queue.store.js';
import { TaskQueue, TaskDefinition, TaskStatus } from './task-queue.js';
import { BackgroundExecutor } from '../hands/background-executor.js';
import { SkillThreadExecutor } from '../brain/skill-thread-executor.js';

export class AutonomousDaemon {
  private isRunning = false;
  private loopInterval: NodeJS.Timeout | null = null;
  private currentTask: TaskDefinition | null = null;
  private readonly CHECK_INTERVAL_MS = 10000; // 10 segundos

  constructor(
    private taskQueueStore: TaskQueueStore,
    private backgroundExecutor: BackgroundExecutor,
    private skillThreadExecutor: SkillThreadExecutor
  ) {
    logger.info('AutonomousDaemon initialized', {
      checkInterval: this.CHECK_INTERVAL_MS,
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('AutonomousDaemon already running');
      return;
    }

    this.isRunning = true;
    logger.info('AutonomousDaemon started');

    this.loopInterval = setInterval(() => {
      this.runLoop().catch((error) => {
        logger.error('Error in daemon loop', { error });
      });
    }, this.CHECK_INTERVAL_MS);

    // Ejecutar primera evaluación inmediatamente
    await this.runLoop();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }

    logger.info('AutonomousDaemon stopped');
  }

  private async runLoop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Si hay tarea en ejecución, no hacer nada
      if (this.currentTask && this.currentTask.status === 'running') {
        return;
      }

      // Obtener próxima tarea pending
      const nextTask = this.taskQueueStore.getNextPendingTask();

      if (!nextTask) {
        // No hay tareas, esperar siguiente ciclo
        return;
      }

      // Marcar como ejecutándose
      this.currentTask = nextTask;
      await this.taskQueueStore.updateTask(nextTask.userId, nextTask.id, {
        status: 'running',
        startedAt: new Date(),
      });

      logger.info('Task execution started', {
        taskId: nextTask.id,
        userId: nextTask.userId,
        skillName: nextTask.skillName,
        title: nextTask.title,
      });

      // Ejecutar tarea
      try {
        await this.executeTask(nextTask);
      } catch (error) {
        await this.handleTaskError(nextTask, error);
      }
    } catch (error) {
      logger.error('Unhandled error in daemon loop', { error });
    }
  }

  private async executeTask(task: TaskDefinition): Promise<void> {
    try {
      // Si tiene subtareas, ejecutarlas secuencialmente
      if (task.subtasks && task.subtasks.length > 0) {
        await this.executeSubtasks(task);
      } else {
        // Ejecutar como comando simple
        await this.executeSimpleTask(task);
      }

      // Marcar como completado
      await this.taskQueueStore.updateTask(task.userId, task.id, {
        status: 'completed',
        completedAt: new Date(),
        actualDurationMs: task.startedAt
          ? Date.now() - task.startedAt.getTime()
          : undefined,
      });

      logger.info('Task completed', {
        taskId: task.id,
        userId: task.userId,
        durationMs: task.startedAt ? Date.now() - task.startedAt.getTime() : undefined,
      });

      this.currentTask = null;
    } catch (error) {
      throw error;
    }
  }

  private async executeSimpleTask(task: TaskDefinition): Promise<void> {
    const params = task.params;

    if (!params.command) {
      throw new Error('Task params must include "command" field');
    }

    // Ejecutar en background
    const processId = await this.backgroundExecutor.executeInBackground(
      params.command,
      task.userId,
      task.skillName
    );

    logger.debug('Task submitted to background executor', {
      taskId: task.id,
      processId,
    });

    // Esperar a que se complete (polling)
    let completed = false;
    let attempt = 0;
    const maxAttempts = 600; // 10 minutos * 6 checks per minute

    while (!completed && attempt < maxAttempts) {
      const process = await this.backgroundExecutor.getProcessStatus(task.userId, processId);

      if (!process) {
        throw new Error(`Process ${processId} not found`);
      }

      if (process.status === 'completed' || process.status === 'failed') {
        completed = true;

        if (process.status === 'failed') {
          throw new Error(`Process failed: ${process.error}`);
        }

        // Actualizar resultado
        await this.taskQueueStore.updateTask(task.userId, task.id, {
          result: process.output,
        });

        break;
      }

      // Esperar 1 segundo antes de checkear de nuevo
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempt++;
    }

    if (!completed) {
      throw new Error(`Task execution timeout (${maxAttempts}s)`);
    }
  }

  private async executeSubtasks(task: TaskDefinition): Promise<void> {
    for (const subtask of task.subtasks) {
      if (subtask.status === 'completed') {
        continue; // Skip ya completadas
      }

      try {
        // Marcar subtask como ejecutándose
        subtask.status = 'running';
        await this.taskQueueStore.updateTask(task.userId, task.id, {
          subtasks: task.subtasks,
        });

        logger.debug('Subtask execution started', {
          taskId: task.id,
          subtaskId: subtask.id,
          order: subtask.order,
          description: subtask.description,
        });

        // Aquí se podría integrar con SkillThreadExecutor o BackgroundExecutor
        // Por ahora, solo marcar como completada (placeholder)
        subtask.status = 'completed';
        subtask.completedAt = new Date();
        subtask.result = `[Subtask ${subtask.order}: ${subtask.description}]`;

        await this.taskQueueStore.updateTask(task.userId, task.id, {
          subtasks: task.subtasks,
        });

        logger.debug('Subtask completed', {
          taskId: task.id,
          subtaskId: subtask.id,
        });
      } catch (error) {
        subtask.status = 'failed';
        await this.taskQueueStore.updateTask(task.userId, task.id, {
          subtasks: task.subtasks,
        });

        logger.error('Subtask failed', {
          taskId: task.id,
          subtaskId: subtask.id,
          error,
        });

        throw error;
      }
    }
  }

  private async handleTaskError(task: TaskDefinition, error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await this.taskQueueStore.updateTask(task.userId, task.id, {
      status: 'failed',
      failedAt: new Date(),
      error: errorMessage,
      actualDurationMs: task.startedAt
        ? Date.now() - task.startedAt.getTime()
        : undefined,
    });

    logger.error('Task execution failed', {
      taskId: task.id,
      userId: task.userId,
      error: errorMessage,
    });

    this.currentTask = null;
  }

  getCurrentTask(): TaskDefinition | null {
    return this.currentTask;
  }

  getStatus(): {
    isRunning: boolean;
    currentTask: TaskDefinition | null;
    checkInterval: number;
  } {
    return {
      isRunning: this.isRunning,
      currentTask: this.currentTask,
      checkInterval: this.CHECK_INTERVAL_MS,
    };
  }
}
