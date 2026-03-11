/**
 * Action Executor - Ejecuta acciones autónomas después de validación
 * Fase 10: Autonomous Actions
 *
 * Responsabilidades:
 * 1. Ejecutar acciones aprobadas by ActionValidator
 * 2. Capturar resultado y errores
 * 3. Guardar log en ActionStore
 * 4. Generar notificación para el usuario (siempre)
 * 5. Facilitar feedback del usuario
 */

import { SafeAction, ActionExecution, ActionTriggerType } from '../config/types.js';
import { ActionStore } from '../storage/action.store.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export interface ActionExecutorOptions {
  // Contexto de ejecución
  userId: string;
  trigger: ActionTriggerType;
  triggerContext?: Record<string, any>;

  // Callbacks (para integración en Brain)
  onExecute?: (action: SafeAction, context: Record<string, any>) => Promise<any>;
  onNotify?: (message: string, metadata: Record<string, any>) => Promise<void>;
}

export class ActionExecutor {
  constructor(private actionStore: ActionStore) {}

  /**
   * Ejecuta una acción validada y genera notificación
   */
  async executeAction(
    action: SafeAction,
    options: ActionExecutorOptions
  ): Promise<ActionExecution> {
    const executionId = uuidv4();
    const startTime = Date.now();

    logger.info('Executing action', {
      actionId: action.actionId,
      skillName: action.skillName,
      trigger: options.trigger,
    });

    let result: any;
    let error: string | undefined;
    let success = false;

    try {
      // Ejecutar la acción si está disponible el callback
      if (options.onExecute) {
        result = await options.onExecute(action, {
          userId: options.userId,
          trigger: options.trigger,
          triggerContext: options.triggerContext,
          parameters: action.parameters,
        });
        success = true;

        logger.info('Action executed successfully', {
          actionId: action.actionId,
          result,
        });
      } else {
        // Si no hay callback, simular éxito
        logger.warn('No onExecute callback provided for action', { actionId: action.actionId });
        success = true;
        result = { simulated: true };
      }
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : 'Unknown error';

      logger.error('Action execution failed', {
        actionId: action.actionId,
        error,
      });
    }

    const durationMs = Date.now() - startTime;

    // Guardar log en ActionStore
    const execution: ActionExecution = {
      id: executionId,
      userId: options.userId,
      actionId: action.actionId,
      skillName: action.skillName,
      executedAt: new Date(),
      durationMs,
      success,
      result: success ? result : undefined,
      error: error,
      trigger: options.trigger,
      context: options.triggerContext,
    };

    await this.actionStore.recordExecution(execution);

    // Generar y enviar notificación (SIEMPRE)
    if (action.notifyAfter) {
      await this.notifyUserAboutExecution(action, execution, options);
    }

    return execution;
  }

  /**
   * Notifica al usuario sobre la ejecución de una acción
   * SIEMPRE se notifica para máxima transparencia
   */
  private async notifyUserAboutExecution(
    action: SafeAction,
    execution: ActionExecution,
    options: ActionExecutorOptions
  ): Promise<void> {
    // Construir mensaje de notificación
    let message: string;

    if (execution.success) {
      message =
        `✨ **Acción**: ${action.name}\n\n` +
        `Ejecuté automáticamente: _${action.description}_\n\n` +
        `⏱️ Duró ${execution.durationMs}ms`;

      // Agregar resultado si es interesante
      if (execution.result && typeof execution.result === 'object') {
        const resultStr = JSON.stringify(execution.result, null, 2);
        if (resultStr.length < 200) {
          message += `\n\n📊 Resultado:\n\`\`\`\n${resultStr}\n\`\`\``;
        }
      }
    } else {
      message =
        `⚠️ **Acción Fallida**: ${action.name}\n\n` +
        `Intenté ejecutar: _${action.description}_\n\n` +
        `❌ Error: \`${execution.error}\``+
        `\n⏱️ Duró ${execution.durationMs}ms`;
    }

    // Opciones de feedback para el usuario
    const metadata = {
      actionId: action.actionId,
      executionId: execution.id,
      canFeedback: true,
      feedbackOptions: ['positive', 'negative', 'ignore'],
      skill: action.skillName,
      trigger: execution.trigger,
    };

    // Enviar notificación si hay callback
    if (options.onNotify) {
      await options.onNotify(message, metadata);
    }

    logger.debug('User notified about action execution', { actionId: action.actionId });
  }

  /**
   * Registra feedback del usuario sobre una acción ejecutada
   */
  async recordFeedback(
    executionId: string,
    feedback: 'positive' | 'negative' | 'ignored'
  ): Promise<void> {
    logger.info('Recording action feedback', { executionId, feedback });

    await this.actionStore.recordFeedback(executionId, feedback);

    // En futuras versiones: usar feedback para mejorar decisiones autónomas
    // Ej: si user da negative feedback repetido → desactivar acción
  }

  /**
   * Obtiene estadísticas de ejecuciones de una acción
   */
  async getActionStats(actionId: string, userId: string) {
    const executions = await this.actionStore.getExecutions(actionId, userId);

    const successCount = executions.filter(e => e.success).length;
    const failureCount = executions.filter(e => !e.success).length;
    const positiveCount = executions.filter(e => e.userFeedback === 'positive').length;
    const negativeCount = executions.filter(e => e.userFeedback === 'negative').length;
    const avgDuration =
      executions.length > 0
        ? executions.reduce((sum, e) => sum + e.durationMs, 0) / executions.length
        : 0;

    return {
      totalExecutions: executions.length,
      successCount,
      failureCount,
      successRate: executions.length > 0 ? (successCount / executions.length) * 100 : 0,
      feedbackStats: {
        positive: positiveCount,
        negative: negativeCount,
        ignored: executions.length - positiveCount - negativeCount,
      },
      avgDuration,
      lastExecution: executions.length > 0 ? executions[executions.length - 1].executedAt : undefined,
    };
  }
}
