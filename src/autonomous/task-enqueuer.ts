import { logger } from '../utils/logger.js';
import { TaskQueueStore } from '../storage/task-queue.store.js';
import { DetectedOpportunity } from './opportunity-detector.js';
import { TaskQueue, TaskType } from './task-queue.js';

export class TaskEnqueuer {
  constructor(private taskQueueStore: TaskQueueStore) {
    logger.info('TaskEnqueuer initialized');
  }

  /**
   * Encola una oportunidad detectada como tarea en el daemon
   * Llamado por AutonomousEngine cuando detecta oportunidad
   */
  async enqueueOpportunity(userId: string, opportunity: DetectedOpportunity): Promise<string | null> {
    try {
      // Determinar tipo de tarea basado en el skill
      const taskType = this.getTaskType(opportunity.skillName);

      // Crear parámetros para el skill
      const params = {
        command: `npm run skill -- ${opportunity.skillName}`,
        context: opportunity.context,
        factors: opportunity.factors,
      };

      // Crear tarea
      const task = this.taskQueueStore.createTask(
        userId,
        taskType,
        opportunity.skillName,
        opportunity.title,
        opportunity.description,
        params,
        opportunity.confidence > 0.8 ? 'high' : 'normal'
      );

      logger.info('Opportunity enqueued as task', {
        userId,
        taskId: task.id,
        skillName: opportunity.skillName,
        confidence: opportunity.confidence,
      });

      return task.id;
    } catch (error) {
      logger.error('Failed to enqueue opportunity', {
        userId,
        skillName: opportunity.skillName,
        error,
      });
      return null;
    }
  }

  /**
   * Encola una tarea desde AutonomousEngine (patrón detectado)
   * Ejemplo: "Es las 9AM, ejecutar skill github"
   */
  async enqueueRoutineTask(
    userId: string,
    skillName: string,
    routineType: 'morning' | 'afternoon' | 'evening' | 'weekly',
    description: string
  ): Promise<string | null> {
    try {
      const params = {
        command: `npm run skill -- ${skillName}`,
        routineType,
      };

      const taskType = this.getTaskType(skillName);
      const title = `${routineType.charAt(0).toUpperCase() + routineType.slice(1)} routine: ${skillName}`;

      const task = this.taskQueueStore.createTask(
        userId,
        taskType,
        skillName,
        title,
        description,
        params,
        'normal'
      );

      logger.info('Routine task enqueued', {
        userId,
        taskId: task.id,
        skillName,
        routineType,
      });

      return task.id;
    } catch (error) {
      logger.error('Failed to enqueue routine task', {
        userId,
        skillName,
        error,
      });
      return null;
    }
  }

  /**
   * Encola una tarea remindida (desde prospective memory)
   * Ejemplo: "Recordatorio: revisar PRs de Ralph"
   */
  async enqueueReminderTask(
    userId: string,
    skillName: string,
    reminderContent: string,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<string | null> {
    try {
      const params = {
        command: `npm run skill -- ${skillName}`,
        reminderContent,
      };

      const taskType = this.getTaskType(skillName);
      const title = `Reminder: ${reminderContent.substring(0, 50)}`;

      const task = this.taskQueueStore.createTask(
        userId,
        taskType,
        skillName,
        title,
        reminderContent,
        params,
        priority
      );

      logger.info('Reminder task enqueued', {
        userId,
        taskId: task.id,
        skillName,
        priority,
      });

      return task.id;
    } catch (error) {
      logger.error('Failed to enqueue reminder task', {
        userId,
        skillName,
        error,
      });
      return null;
    }
  }

  /**
   * Determina tipo de tarea basado en nombre del skill
   */
  private getTaskType(skillName: string): TaskType {
    const lower = skillName.toLowerCase();

    if (lower.includes('github') || lower.includes('git')) {
      return 'skill_execution';
    }
    if (lower.includes('crypto') || lower.includes('inversiones')) {
      return 'data_processing';
    }
    if (lower.includes('search') || lower.includes('research')) {
      return 'research';
    }
    if (
      lower.includes('home') ||
      lower.includes('monitor') ||
      lower.includes('watch')
    ) {
      return 'monitoring';
    }

    return 'skill_execution'; // Default
  }

  /**
   * Obtiene recomendación de delay antes de ejecutar tarea
   * Basado en ventana de tiempo óptima
   */
  getRecommendedDelay(opportunity: DetectedOpportunity): number {
    if (!opportunity.bestWindow) {
      return 0; // Ejecutar inmediatamente
    }

    const delayMap: Record<string, number> = {
      'now': 0,
      'in_5min': 5 * 60 * 1000,
      'in_15min': 15 * 60 * 1000,
      'in_30min': 30 * 60 * 1000,
      'in_1hour': 60 * 60 * 1000,
    };

    return delayMap[opportunity.bestWindow] || 0;
  }
}
