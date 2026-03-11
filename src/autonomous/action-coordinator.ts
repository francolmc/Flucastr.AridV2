/**
 * Action Coordinator - Orquesta la ejecución de acciones autónomas
 * Fase 10: PASO 6
 *
 * Responsabilidades:
 * 1. Obtener acciones elegibles de todos los skills
 * 2. Validar cada acción
 * 3. Ejecutar las aprobadas
 * 4. Notificar al usuario
 * 5. Registrar feedback
 */

import { SafeAction, ActionTriggerType } from '../config/types.js';
import { SkillStore } from '../storage/skill.store.js';
import { ActionValidator, ActionExecutionContext } from './action-validator.js';
import { ActionExecutor } from './action-executor.js';
import { ActionStore } from '../storage/action.store.js';
import { ContextAnalyzer } from './context-analyzer.js';
import { InterruptionPolicyStore } from './interruption-policy.store.js';
import { logger } from '../utils/logger.js';

export class ActionCoordinator {
  private validator: ActionValidator;
  private executor: ActionExecutor;

  constructor(
    private skillStore: SkillStore,
    private actionStore: ActionStore,
    private contextAnalyzer: ContextAnalyzer,
    private interruptionPolicyStore: InterruptionPolicyStore,
    private telegramSender: (userId: string, message: string) => Promise<void>
  ) {
    this.validator = new ActionValidator();
    this.executor = new ActionExecutor(actionStore);
  }

  /**
   * Ejecuta todas las acciones elegibles para el contexto actual
   */
  async executeEligibleActions(
    userId: string,
    trigger: ActionTriggerType,
    triggerContext?: Record<string, any>
  ): Promise<void> {
    try {
      // 1. Obtener todas las acciones de todos los skills del usuario
      const allActions = await this.getAllActions(userId);

      if (allActions.length === 0) {
        logger.debug('No safe actions available', { userId });
        return;
      }

      // 2. Filtrar acciones que coincidan con el trigger actual
      const eligibleActions = allActions.filter(action =>
        action.triggers.some(t => t.type === trigger)
      );

      if (eligibleActions.length === 0) {
        logger.debug('No eligible actions for trigger', { userId, trigger });
        return;
      }

      logger.info('Found eligible actions', {
        userId,
        trigger,
        count: eligibleActions.length,
      });

      // 3. Para cada acción, validar y ejecutar si es segura
      const executionContext: ActionExecutionContext = {
        userId,
        trigger,
        triggerContext,
        currentTime: new Date(),
      };

      for (const action of eligibleActions) {
        await this.validateAndExecuteAction(action, executionContext);
      }
    } catch (error) {
      logger.error('Error executing eligible actions', { userId, trigger, error });
    }
  }

  /**
   * Valida una acción y ejecuta si pasa validación
   */
  private async validateAndExecuteAction(
    action: SafeAction,
    context: ActionExecutionContext
  ): Promise<void> {
    try {
      // 1. Obtener ejecuciones recientes para validar límites
      const recentExecutions = await this.actionStore.getRecentExecutions(
        action.actionId,
        context.userId,
        24
      );

      // 2. Validar acción
      const validation = this.validator.validateAction(action, context, recentExecutions);

      if (!validation.canExecute) {
        logger.debug('Action validation failed', {
          actionId: action.actionId,
          reason: validation.reason,
          warnings: validation.warnings,
        });
        return;
      }

      if (validation.warnings.length > 0) {
        logger.warn('Action validation warnings', {
          actionId: action.actionId,
          warnings: validation.warnings,
        });
      }

      // 3. Verificar interruption policies (¿podemos enviar notificación?)
      const canInterrupt = await this.interruptionPolicyStore.canInterrupt(
        context.userId,
        'normal', // Las acciones son ejecutadas silenciosamente
        'autonomous_action'
      );

      if (!canInterrupt) {
        logger.debug('Action blocked by interruption policy', {
          actionId: action.actionId,
        });
        // TODO PASO 7: Queue para ejecutar más tarde
        return;
      }

      // 4. Ejecutar acción
      await this.executor.executeAction(action, {
        userId: context.userId,
        trigger: context.trigger,
        triggerContext: context.triggerContext,
        onExecute: async (act, ctx) => {
          // Callback para ejecutar - en futuras versiones, skills lo implementarán
          logger.info('Action would execute here', {
            actionId: act.actionId,
            skillName: act.skillName,
          });
          return { executed: true, timestamp: new Date() };
        },
        onNotify: async (message, metadata) => {
          // Notificar al usuario sobre la ejecución
          await this.telegramSender(context.userId, message);
        },
      });
    } catch (error) {
      logger.error('Error validating/executing action', {
        actionId: action.actionId,
        error,
      });
    }
  }

  /**
   * Obtiene todas las acciones de todos los skills del usuario
   */
  private async getAllActions(userId: string): Promise<SafeAction[]> {
    const allSkills = await this.skillStore.listAvailableSkills();
    const userSkills = allSkills.filter(s => s.userId === userId);

    const allActions: SafeAction[] = [];

    for (const skill of userSkills) {
      if (skill.safeActions && Array.isArray(skill.safeActions)) {
        allActions.push(...skill.safeActions);
      }
    }

    return allActions;
  }

  /**
   * Obtiene estadísticas de ejecución de acciones
   */
  async getStats(userId: string) {
    return await this.actionStore.getSkillStats(userId);
  }

  /**
   * Habilita/deshabilita una acción
   */
  async toggleAction(userId: string, actionId: string, enabled: boolean): Promise<void> {
    const allSkills = await this.skillStore.listAvailableSkills();
    const userSkills = allSkills.filter(s => s.userId === userId);

    for (const skill of userSkills) {
      if (skill.safeActions) {
        const action = skill.safeActions.find(a => a.actionId === actionId);
        if (action) {
          action.enabled = enabled;
          // TODO: Guardar cambio en SkillStore
          logger.info('Action toggled', { actionId, enabled });
          return;
        }
      }
    }

    logger.warn('Action not found', { actionId, userId });
  }
}
