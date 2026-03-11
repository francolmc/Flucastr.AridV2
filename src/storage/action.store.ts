/**
 * Action Store - Persistencia de ejecuciones de acciones autónomas
 * Fase 10: Autonomous Actions
 *
 * Almacena:
 * 1. Log de ejecuciones (cuándo, éxito/fallo, duración)
 * 2. Feedback del usuario (positivo/negativo)
 * 3. Estadísticas de acciones
 */

import { JSONStore } from './json-store.js';
import { ActionExecution } from '../config/types.js';
import { logger } from '../utils/logger.js';

export interface ActionExecutionLog {
  actionId: string;
  executions: ActionExecution[];
}

export class ActionStore {
  constructor(private jsonStore: JSONStore) {}

  /**
   * Registra una ejecución de acción
   */
  async recordExecution(execution: ActionExecution): Promise<void> {
    const data = this.jsonStore.read();

    if (!data.action_executions) {
      data.action_executions = {};
    }

    if (!data.action_executions[execution.userId]) {
      data.action_executions[execution.userId] = [];
    }

    data.action_executions[execution.userId].push(execution);

    this.jsonStore.write(data);

    logger.debug('Action execution recorded', {
      actionId: execution.actionId,
      userId: execution.userId,
      success: execution.success,
    });
  }

  /**
   * Obtiene todas las ejecuciones de una acción para un usuario
   */
  async getExecutions(actionId: string, userId: string): Promise<ActionExecution[]> {
    const data = this.jsonStore.read();

    if (!data.action_executions || !data.action_executions[userId]) {
      return [];
    }

    return data.action_executions[userId].filter((exec: ActionExecution) => exec.actionId === actionId);
  }

  /**
   * Obtiene ejecuciones recientes para validación de límites
   */
  async getRecentExecutions(
    actionId: string,
    userId: string,
    hoursBack: number = 24
  ): Promise<ActionExecution[]> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hoursBack);

    const allExecutions = await this.getExecutions(actionId, userId);

    return allExecutions.filter(exec => new Date(exec.executedAt) >= cutoff);
  }

  /**
   * Registra feedback del usuario sobre una ejecución
   */
  async recordFeedback(
    executionId: string,
    feedback: 'positive' | 'negative' | 'ignored'
  ): Promise<void> {
    const data = this.jsonStore.read();

    if (!data.action_executions) {
      logger.warn('No action_executions to update feedback');
      return;
    }

    // Buscar la ejecución en todos los usuarios
    for (const userId in data.action_executions) {
      const executions = data.action_executions[userId];
      const execution = executions.find((e: ActionExecution) => e.id === executionId);

      if (execution) {
        execution.userFeedback = feedback;
        this.jsonStore.write(data);

        logger.info('Action feedback recorded', {
          executionId,
          userId,
          feedback,
        });
        return;
      }
    }

    logger.warn('Execution not found for feedback', { executionId });
  }

  /**
   * Obtiene estadísticas de ejecución por skill
   */
  async getSkillStats(userId: string): Promise<Record<string, any>> {
    const data = this.jsonStore.read();

    if (!data.action_executions || !data.action_executions[userId]) {
      return {};
    }

    const executions = data.action_executions[userId];
    const stats: Record<string, any> = {};

    for (const execution of executions) {
      const { skillName, success, userFeedback } = execution;

      if (!stats[skillName]) {
        stats[skillName] = {
          totalExecutions: 0,
          successCount: 0,
          failureCount: 0,
          feedbackStats: { positive: 0, negative: 0, ignored: 0 },
        };
      }

      stats[skillName].totalExecutions++;
      if (success) {
        stats[skillName].successCount++;
      } else {
        stats[skillName].failureCount++;
      }

      if (userFeedback) {
        stats[skillName].feedbackStats[userFeedback]++;
      }
    }

    // Calcular success rate
    for (const skillName in stats) {
      const skillStats = stats[skillName];
      skillStats.successRate =
        (skillStats.successCount / skillStats.totalExecutions) * 100;
    }

    return stats;
  }

  /**
   * Obtiene todas las ejecuciones sin completar feedback
   * (para recordarle al usuario si quiere dejar feedback)
   */
  async getPendingFeedback(userId: string, maxHours: number = 24): Promise<ActionExecution[]> {
    const data = this.jsonStore.read();

    if (!data.action_executions || !data.action_executions[userId]) {
      return [];
    }

    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - maxHours);

    return data.action_executions[userId].filter((exec: ActionExecution) => {
      const execTime = new Date(exec.executedAt);
      return execTime >= cutoff && !exec.userFeedback;
    });
  }

  /**
   * Limpia ejecuciones antiguas (más de X días)
   * Mantener cleanups frecuentes para evitar "action_executions" gigante
   */
  async cleanupOldExecutions(daysBack: number = 30): Promise<number> {
    const data = this.jsonStore.read();

    if (!data.action_executions) {
      return 0;
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    let cleanedCount = 0;

    for (const userId in data.action_executions) {
      const before = data.action_executions[userId].length;

      data.action_executions[userId] = data.action_executions[userId].filter(
        (exec: ActionExecution) => new Date(exec.executedAt) >= cutoff
      );

      cleanedCount += before - data.action_executions[userId].length;
    }

    if (cleanedCount > 0) {
      this.jsonStore.write(data);

      logger.info('Cleaned up old action executions', {
        count: cleanedCount,
        daysBack,
      });
    }

    return cleanedCount;
  }
}
