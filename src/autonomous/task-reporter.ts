import { logger } from '../utils/logger.js';
import { TaskDefinition } from './task-queue.js';

export type ReportingPolicy = 'completion_only' | 'on_doubt' | 'smart' | 'verbose';

export interface ReportConfig {
  policy: ReportingPolicy;
  telegramSender: (userId: string, message: string) => Promise<void>;
}

export class TaskReporter {
  constructor(private config: ReportConfig) {
    logger.info('TaskReporter initialized', {
      policy: config.policy,
    });
  }

  async reportTaskStarted(task: TaskDefinition): Promise<void> {
    if (this.config.policy === 'verbose' || this.config.policy === 'smart') {
      const message = `🚀 Iniciando tarea: ${task.title}\n📋 ${task.description}`;

      await this.config.telegramSender(task.userId, message);

      logger.debug('Task start reported', {
        taskId: task.id,
        userId: task.userId,
      });
    }
  }

  async reportTaskCompleted(task: TaskDefinition): Promise<void> {
    if (
      this.config.policy === 'completion_only' ||
      this.config.policy === 'on_doubt' ||
      this.config.policy === 'smart' ||
      this.config.policy === 'verbose'
    ) {
      const durationSeconds = task.actualDurationMs ? Math.round(task.actualDurationMs / 1000) : 0;
      const durationStr =
        durationSeconds < 60
          ? `${durationSeconds}s`
          : `${Math.round(durationSeconds / 60)}m`;

      const resultPreview = task.result ? task.result.substring(0, 200) : 'Completada sin resultado';

      const message = `✅ Tarea completada: ${task.title}\n\n📊 Duración: ${durationStr}\n\n📝 Resultado:\n${resultPreview}${
        task.result && task.result.length > 200 ? '\n...' : ''
      }`;

      await this.config.telegramSender(task.userId, message);

      logger.info('Task completion reported', {
        taskId: task.id,
        userId: task.userId,
        duration: durationStr,
      });
    }
  }

  async reportTaskFailed(task: TaskDefinition): Promise<void> {
    const message = `❌ Tarea falló: ${task.title}\n\n⚠️ Error: ${task.error || 'Unknown error'}`;

    await this.config.telegramSender(task.userId, message);

    logger.warn('Task failure reported', {
      taskId: task.id,
      userId: task.userId,
      error: task.error,
    });
  }

  async reportTaskProgress(task: TaskDefinition): Promise<void> {
    if (this.config.policy === 'smart' || this.config.policy === 'verbose') {
      const progress = Math.round(this.getTaskProgress(task) * 100);

      if (progress > 0 && progress < 100 && progress % 50 === 0) {
        const message = `⏳ Progreso de "${task.title}": ${progress}%`;

        await this.config.telegramSender(task.userId, message);

        logger.debug('Task progress reported', {
          taskId: task.id,
          userId: task.userId,
          progress,
        });
      }
    }
  }

  async askForHelp(
    task: TaskDefinition,
    question: string,
    options?: string[]
  ): Promise<void> {
    if (this.config.policy === 'on_doubt' || this.config.policy === 'smart' || this.config.policy === 'verbose') {
      let message = `❓ Necesito ayuda con la tarea: "${task.title}"\n\n${question}`;

      if (options && options.length > 0) {
        message += '\n\nOpciones:\n';
        options.forEach((opt, idx) => {
          message += `${idx + 1}. ${opt}\n`;
        });
      }

      await this.config.telegramSender(task.userId, message);

      logger.info('Help requested', {
        taskId: task.id,
        userId: task.userId,
        question,
      });
    }
  }

  private getTaskProgress(task: TaskDefinition): number {
    if (task.subtasks && task.subtasks.length > 0) {
      const completed = task.subtasks.filter((s) => s.status === 'completed').length;
      return completed / task.subtasks.length;
    }

    return task.status === 'completed' ? 1 : task.status === 'running' ? 0.5 : 0;
  }

  setPolicy(policy: ReportingPolicy): void {
    this.config.policy = policy;
    logger.info('Reporting policy changed', { policy });
  }

  getPolicy(): ReportingPolicy {
    return this.config.policy;
  }
}
