/**
 * Action Validator - Valida si una acción es segura antes de ejecutarla
 * Fase 10: Autonomous Actions
 *
 * Responsabilidades:
 * 1. Validar que la acción esté habilitada
 * 2. Verificar límites de ejecución (max per day, cooldown)
 * 3. Validar que se cumplen las condiciones del trigger
 * 4. Generar rationale detallado de decisiones
 */

import { SafeAction, ActionTrigger, ActionExecution, ActionTriggerType } from '../config/types.js';
import { logger } from '../utils/logger.js';

export interface ActionValidationResult {
  isValid: boolean;
  reason: string;
  canExecute: boolean;
  warnings: string[];
}

export interface ActionExecutionContext {
  userId: string;
  trigger: ActionTriggerType;
  triggerContext?: Record<string, any>;
  currentTime: Date;
}

export class ActionValidator {
  /**
   * Valida si una acción puede ejecutarse ahora
   */
  validateAction(
    action: SafeAction,
    context: ActionExecutionContext,
    recentExecutions: ActionExecution[] // Últimas ejecuciones del mismo actionId
  ): ActionValidationResult {
    const warnings: string[] = [];

    // 1. Revisar si está habilitada
    if (!action.enabled) {
      return {
        isValid: false,
        reason: 'Action is disabled',
        canExecute: false,
        warnings: ['User disabled this action'],
      };
    }

    // 2. Validar que el trigger coincida
    const triggerMatch = action.triggers.some(trigger =>
      this.matchesTrigger(trigger, context)
    );

    if (!triggerMatch) {
      return {
        isValid: false,
        reason: 'No matching trigger',
        canExecute: false,
        warnings: [`Trigger "${context.trigger}" doesn't match action triggers`],
      };
    }

    // 3. Verificar límite diario
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayExecutions = recentExecutions.filter(exec => {
      const execDate = new Date(exec.executedAt);
      execDate.setHours(0, 0, 0, 0);
      return execDate.getTime() === today.getTime();
    });

    if (action.maxExecutionsPerDay && todayExecutions.length >= action.maxExecutionsPerDay) {
      warnings.push(
        `Daily limit reached (${action.maxExecutionsPerDay} max, ${todayExecutions.length} today)`
      );
      return {
        isValid: false,
        reason: 'Daily execution limit reached',
        canExecute: false,
        warnings,
      };
    }

    // 4. Verificar cooldown
    if (action.cooldownMinutes && recentExecutions.length > 0) {
      const lastExecution = recentExecutions[recentExecutions.length - 1];
      const lastExecTime = new Date(lastExecution.executedAt);
      const minutesSinceLastExec =
        (context.currentTime.getTime() - lastExecTime.getTime()) / (1000 * 60);

      if (minutesSinceLastExec < action.cooldownMinutes) {
        const waitTime = Math.ceil(action.cooldownMinutes - minutesSinceLastExec);
        warnings.push(`Cooldown active: wait ${waitTime} more minutes`);
        return {
          isValid: false,
          reason: `Cooldown period (${action.cooldownMinutes} min) not yet elapsed`,
          canExecute: false,
          warnings,
        };
      }
    }

    // Si pasó todas las validaciones
    return {
      isValid: true,
      reason: 'All validations passed',
      canExecute: true,
      warnings,
    };
  }

  /**
   * Verifica si un trigger coincide con el contexto actual
   */
  private matchesTrigger(trigger: ActionTrigger, context: ActionExecutionContext): boolean {
    // Primero: verificar tipo de trigger
    if (trigger.type !== context.trigger) {
      return false;
    }

    // Segundo: verificar condiciones adicionales si existen
    if (trigger.condition) {
      return this.matchesCondition(trigger.condition, context);
    }

    return true;
  }

  /**
   * Evalúa condiciones del trigger contra el contexto
   * Soporta operadores simples: eq, gt, lt, in, contains
   */
  private matchesCondition(condition: Record<string, any>, context: ActionExecutionContext): boolean {
    // Si no hay triggerContext, no podemos validar condiciones
    if (!context.triggerContext) {
      logger.warn('Trigger condition requires context but none provided', { condition });
      return false;
    }

    // Iterar sobre cada condición
    for (const [key, expectedValue] of Object.entries(condition)) {
      const actualValue = context.triggerContext[key];

      // Soporte para operadores complejos: { skillName: { eq: 'github' } }
      if (typeof expectedValue === 'object' && expectedValue !== null && !Array.isArray(expectedValue)) {
        if (!this.evaluateOperator(actualValue, expectedValue)) {
          return false;
        }
      } else {
        // Comparación directa
        if (actualValue !== expectedValue) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Evalúa operadores en condiciones
   * Ej: { eventType: { in: ['failed_ci', 'failed_workflow'] } }
   */
  private evaluateOperator(actualValue: any, operators: Record<string, any>): boolean {
    for (const [operator, operandValue] of Object.entries(operators)) {
      switch (operator) {
        case 'eq':
          if (actualValue !== operandValue) return false;
          break;
        case 'ne':
          if (actualValue === operandValue) return false;
          break;
        case 'gt':
          if (!(actualValue > operandValue)) return false;
          break;
        case 'lt':
          if (!(actualValue < operandValue)) return false;
          break;
        case 'gte':
          if (!(actualValue >= operandValue)) return false;
          break;
        case 'lte':
          if (!(actualValue <= operandValue)) return false;
          break;
        case 'in':
          if (!Array.isArray(operandValue) || !operandValue.includes(actualValue))
            return false;
          break;
        case 'contains':
          if (typeof actualValue !== 'string' || !actualValue.includes(operandValue))
            return false;
          break;
        default:
          logger.warn(`Unknown operator: ${operator}`);
          return false;
      }
    }

    return true;
  }
}
