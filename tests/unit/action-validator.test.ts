/**
 * Tests for ActionValidator - PASO 6
 */

import { describe, test, expect } from '@jest/globals';
import { ActionValidator } from '../../src/autonomous/action-validator.js';
import { SafeAction, ActionExecution, ActionTriggerType } from '../../src/config/types.js';

describe('ActionValidator', () => {
  let validator: ActionValidator;

  beforeEach(() => {
    validator = new ActionValidator();
  });

  // Test 1: Acción deshabilitada
  test('should reject disabled action', () => {
    const action: SafeAction = {
      actionId: 'test-disabled',
      name: 'Test Action',
      description: 'Test',
      skillName: 'test-skill',
      triggers: [{ type: 'memory_overdue' }],
      parameters: {},
      requiresConfirmation: false,
      notifyAfter: true,
      enabled: false,  // ← DISABLED
      createdAt: new Date(),
    };

    const result = validator.validateAction(
      action,
      {
        userId: 'user-1',
        trigger: 'memory_overdue',
        currentTime: new Date(),
      },
      []
    );

    expect(result.isValid).toBe(false);
    expect(result.canExecute).toBe(false);
    expect(result.reason).toBe('Action is disabled');
  });

  // Test 2: Trigger no coincide
  test('should reject action when trigger does not match', () => {
    const action: SafeAction = {
      actionId: 'test-trigger',
      name: 'Test Action',
      description: 'Test',
      skillName: 'test-skill',
      triggers: [{ type: 'daily_routine' }],  // Espera daily_routine
      parameters: {},
      requiresConfirmation: false,
      notifyAfter: true,
      enabled: true,
      createdAt: new Date(),
    };

    const result = validator.validateAction(
      action,
      {
        userId: 'user-1',
        trigger: 'memory_overdue',  // ← Diferente trigger
        currentTime: new Date(),
      },
      []
    );

    expect(result.isValid).toBe(false);
    expect(result.canExecute).toBe(false);
    expect(result.reason).toContain('No matching trigger');
  });

  // Test 3: Límite diario excedido
  test('should reject action when daily limit exceeded', () => {
    const action: SafeAction = {
      actionId: 'test-limit',
      name: 'Test Action',
      description: 'Test',
      skillName: 'test-skill',
      triggers: [{ type: 'memory_overdue' }],
      parameters: {},
      requiresConfirmation: false,
      notifyAfter: true,
      maxExecutionsPerDay: 2,  // Max 2 veces por día
      enabled: true,
      createdAt: new Date(),
    };

    // Crear ejecutions recientes (hoy)
    const today = new Date();
    const recentExecutions: ActionExecution[] = [
      {
        id: 'exec-1',
        userId: 'user-1',
        actionId: 'test-limit',
        skillName: 'test-skill',
        executedAt: new Date(today.getTime() - 1000 * 60 * 60),  // hace 1 hora
        durationMs: 100,
        success: true,
        trigger: 'memory_overdue',
      },
      {
        id: 'exec-2',
        userId: 'user-1',
        actionId: 'test-limit',
        skillName: 'test-skill',
        executedAt: new Date(today.getTime() - 1000 * 60 * 30),  // hace 30 min
        durationMs: 100,
        success: true,
        trigger: 'memory_overdue',
      },
    ];

    const result = validator.validateAction(
      action,
      {
        userId: 'user-1',
        trigger: 'memory_overdue',
        currentTime: new Date(),
      },
      recentExecutions
    );

    expect(result.isValid).toBe(false);
    expect(result.canExecute).toBe(false);
    expect(result.reason).toContain('Daily execution limit reached');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  // Test 4: Cooldown aún vigente
  test('should reject action when cooldown is still active', () => {
    const action: SafeAction = {
      actionId: 'test-cooldown',
      name: 'Test Action',
      description: 'Test',
      skillName: 'test-skill',
      triggers: [{ type: 'memory_overdue' }],
      parameters: {},
      requiresConfirmation: false,
      notifyAfter: true,
      cooldownMinutes: 60,  // 60 min de cooldown
      enabled: true,
      createdAt: new Date(),
    };

    // Última ejecución hace 30 minutos
    const recentExecutions: ActionExecution[] = [
      {
        id: 'exec-recent',
        userId: 'user-1',
        actionId: 'test-cooldown',
        skillName: 'test-skill',
        executedAt: new Date(Date.now() - 1000 * 60 * 30),  // hace 30 min
        durationMs: 100,
        success: true,
        trigger: 'memory_overdue',
      },
    ];

    const result = validator.validateAction(
      action,
      {
        userId: 'user-1',
        trigger: 'memory_overdue',
        currentTime: new Date(),
      },
      recentExecutions
    );

    expect(result.isValid).toBe(false);
    expect(result.canExecute).toBe(false);
    expect(result.reason).toContain('Cooldown period');
    expect(result.warnings[0]).toContain('wait');
  });

  // Test 5: Acción válida - todo pasa
  test('should allow valid action with all checks passing', () => {
    const action: SafeAction = {
      actionId: 'test-valid',
      name: 'Test Action',
      description: 'Test',
      skillName: 'test-skill',
      triggers: [{ type: 'memory_overdue' }],
      parameters: {},
      requiresConfirmation: false,
      notifyAfter: true,
      maxExecutionsPerDay: 5,
      cooldownMinutes: 10,
      enabled: true,
      createdAt: new Date(),
    };

    // Última ejecución hace 20 minutos (cooldown ok)
    const recentExecutions: ActionExecution[] = [
      {
        id: 'exec-old',
        userId: 'user-1',
        actionId: 'test-valid',
        skillName: 'test-skill',
        executedAt: new Date(Date.now() - 1000 * 60 * 20),  // hace 20 min
        durationMs: 100,
        success: true,
        trigger: 'memory_overdue',
      },
    ];

    const result = validator.validateAction(
      action,
      {
        userId: 'user-1',
        trigger: 'memory_overdue',
        currentTime: new Date(),
      },
      recentExecutions
    );

    expect(result.isValid).toBe(true);
    expect(result.canExecute).toBe(true);
    expect(result.reason).toBe('All validations passed');
  });

  // Test 6: Condiciones complejas - match
  test('should accept action with matching complex conditions', () => {
    const action: SafeAction = {
      actionId: 'test-conditions',
      name: 'Test Action',
      description: 'Test',
      skillName: 'github-skill',
      triggers: [
        {
          type: 'external_event',
          condition: {
            skillName: { in: ['github-skill', 'gitlab'] },
            eventType: { ne: 'warning' },
          },
        },
      ],
      parameters: {},
      requiresConfirmation: false,
      notifyAfter: true,
      enabled: true,
      createdAt: new Date(),
    };

    const result = validator.validateAction(
      action,
      {
        userId: 'user-1',
        trigger: 'external_event',
        triggerContext: {
          skillName: 'github-skill',
          eventType: 'failed_ci',
        },
        currentTime: new Date(),
      },
      []
    );

    expect(result.isValid).toBe(true);
    expect(result.canExecute).toBe(true);
  });

  // Test 7: Condiciones complejas - no match
  test('should reject action when complex conditions do not match', () => {
    const action: SafeAction = {
      actionId: 'test-conditions-reject',
      name: 'Test Action',
      description: 'Test',
      skillName: 'github-skill',
      triggers: [
        {
          type: 'external_event',
          condition: {
            skillName: { in: ['github-skill', 'gitlab'] },
            eventType: { ne: 'warning' },  // ← Rechaza 'warning'
          },
        },
      ],
      parameters: {},
      requiresConfirmation: false,
      notifyAfter: true,
      enabled: true,
      createdAt: new Date(),
    };

    const result = validator.validateAction(
      action,
      {
        userId: 'user-1',
        trigger: 'external_event',
        triggerContext: {
          skillName: 'github-skill',
          eventType: 'warning',  // ← No match debido a 'ne'
        },
        currentTime: new Date(),
      },
      []
    );

    expect(result.isValid).toBe(false);
    expect(result.canExecute).toBe(false);
  });

  // Test 8: Sin ejecuciones previas - first execution
  test('should allow first execution (no previous executions)', () => {
    const action: SafeAction = {
      actionId: 'test-first',
      name: 'Test Action',
      description: 'Test',
      skillName: 'test-skill',
      triggers: [{ type: 'memory_overdue' }],
      parameters: {},
      requiresConfirmation: false,
      notifyAfter: true,
      maxExecutionsPerDay: 1,
      cooldownMinutes: 60,
      enabled: true,
      createdAt: new Date(),
    };

    const result = validator.validateAction(
      action,
      {
        userId: 'user-1',
        trigger: 'memory_overdue',
        currentTime: new Date(),
      },
      [] // ← empty array, nunca ejecutada antes
    );

    expect(result.isValid).toBe(true);
    expect(result.canExecute).toBe(true);
  });
});
