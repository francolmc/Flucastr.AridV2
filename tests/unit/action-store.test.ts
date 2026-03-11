/**
 * Tests for ActionStore - PASO 6 Persistence
 */

import { describe, test, expect, beforeEach, beforeAll, afterEach } from '@jest/globals';
import { ActionStore } from '../../src/storage/action.store.js';
import { ActionExecution } from '../../src/config/types.js';
import { JSONStore } from '../../src/storage/json-store.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ActionStore', () => {
  let actionStore: ActionStore;
  let jsonStore: JSONStore;
  let tempDir: string;

  beforeAll(() => {
    // Crear directorio temporal para tests
    tempDir = mkdtempSync(join(tmpdir(), 'aridv2-action-test-'));
  });

  afterEach(() => {
    // Cleanup después de cada test
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = mkdtempSync(join(tmpdir(), 'aridv2-action-test-'));
  });

  beforeEach(() => {
    const storagePath = join(tempDir, 'test-store.json');
    jsonStore = new JSONStore(storagePath);
    actionStore = new ActionStore(jsonStore);
  });

  // Test 1: Registrar ejecución
  test('should record an action execution', async () => {
    const execution: ActionExecution = {
      id: 'exec-1',
      userId: 'user-1',
      actionId: 'action-lights-off',
      skillName: 'home-assistant',
      executedAt: new Date(),
      durationMs: 450,
      success: true,
      result: { room: 'living-room', status: 'off' },
      trigger: 'daily_routine',
    };

    await actionStore.recordExecution(execution);

    const executions = await actionStore.getExecutions('action-lights-off', 'user-1');
    expect(executions).toHaveLength(1);
    expect(executions[0].id).toBe('exec-1');
    expect(executions[0].success).toBe(true);
  });

  // Test 2: Registrar múltiples ejecuciones
  test('should record multiple executions and retrieve them', async () => {
    const executions: ActionExecution[] = [
      {
        id: 'exec-1',
        userId: 'user-1',
        actionId: 'action-1',
        skillName: 'skill-1',
        executedAt: new Date(),
        durationMs: 100,
        success: true,
        trigger: 'memory_overdue',
      },
      {
        id: 'exec-2',
        userId: 'user-1',
        actionId: 'action-1',
        skillName: 'skill-1',
        executedAt: new Date(),
        durationMs: 150,
        success: true,
        trigger: 'memory_overdue',
      },
      {
        id: 'exec-3',
        userId: 'user-1',
        actionId: 'action-2',  // ← Diferente action
        skillName: 'skill-1',
        executedAt: new Date(),
        durationMs: 80,
        success: false,
        error: 'Timeout',
        trigger: 'external_event',
      },
    ];

    for (const exec of executions) {
      await actionStore.recordExecution(exec);
    }

    // Verificar action-1 (2 ejecuciones)
    const action1Execs = await actionStore.getExecutions('action-1', 'user-1');
    expect(action1Execs).toHaveLength(2);
    expect(action1Execs.every(e => e.actionId === 'action-1')).toBe(true);

    // Verificar action-2 (1 ejecución)
    const action2Execs = await actionStore.getExecutions('action-2', 'user-1');
    expect(action2Execs).toHaveLength(1);
    expect(action2Execs[0].success).toBe(false);
  });

  // Test 3: Registrar feedback
  test('should record user feedback on execution', async () => {
    const execution: ActionExecution = {
      id: 'exec-feedback',
      userId: 'user-1',
      actionId: 'action-test',
      skillName: 'test-skill',
      executedAt: new Date(),
      durationMs: 100,
      success: true,
      trigger: 'memory_overdue',
    };

    await actionStore.recordExecution(execution);

    // Sin feedback inicial
    let execs = await actionStore.getExecutions('action-test', 'user-1');
    expect(execs[0].userFeedback).toBeUndefined();

    // Registrar feedback
    await actionStore.recordFeedback('exec-feedback', 'positive');

    // Verificar feedback registrado
    execs = await actionStore.getExecutions('action-test', 'user-1');
    expect(execs[0].userFeedback).toBe('positive');
  });

  // Test 4: Obtener ejecuciones recientes
  test('should get only recent executions within time window', async () => {
    const now = new Date();
    const oldExecution: ActionExecution = {
      id: 'exec-old',
      userId: 'user-1',
      actionId: 'action-recent',
      skillName: 'skill-1',
      executedAt: new Date(now.getTime() - 48 * 60 * 60 * 1000),  // hace 48 horas
      durationMs: 100,
      success: true,
      trigger: 'memory_overdue',
    };

    const recentExecution: ActionExecution = {
      id: 'exec-recent',
      userId: 'user-1',
      actionId: 'action-recent',
      skillName: 'skill-1',
      executedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),  // hace 2 horas
      durationMs: 100,
      success: true,
      trigger: 'memory_overdue',
    };

    await actionStore.recordExecution(oldExecution);
    await actionStore.recordExecution(recentExecution);

    // Obtener ejecuciones últimas 24 horas
    const recent = await actionStore.getRecentExecutions('action-recent', 'user-1', 24);

    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe('exec-recent');
  });

  // Test 5: Estadísticas por skill
  test('should calculate skill statistics correctly', async () => {
    const executions: ActionExecution[] = [
      {
        id: 'exec-1',
        userId: 'user-1',
        actionId: 'action-lights',
        skillName: 'home-assistant',
        executedAt: new Date(),
        durationMs: 100,
        success: true,
        trigger: 'daily_routine',
        userFeedback: 'positive',
      },
      {
        id: 'exec-2',
        userId: 'user-1',
        actionId: 'action-lights',
        skillName: 'home-assistant',
        executedAt: new Date(),
        durationMs: 120,
        success: true,
        trigger: 'daily_routine',
        userFeedback: 'positive',
      },
      {
        id: 'exec-3',
        userId: 'user-1',
        actionId: 'action-lights',
        skillName: 'home-assistant',
        executedAt: new Date(),
        durationMs: 90,
        success: false,
        trigger: 'daily_routine',
        error: 'Connection timeout',
        userFeedback: 'negative',
      },
      {
        id: 'exec-4',
        userId: 'user-1',
        actionId: 'action-email',
        skillName: 'gmail',
        executedAt: new Date(),
        durationMs: 500,
        success: true,
        trigger: 'external_event',
        userFeedback: 'ignored',
      },
    ];

    for (const exec of executions) {
      await actionStore.recordExecution(exec);
    }

    const stats = await actionStore.getSkillStats('user-1');

    // Verificar stats de home-assistant
    expect(stats['home-assistant']).toBeDefined();
    expect(stats['home-assistant'].totalExecutions).toBe(3);
    expect(stats['home-assistant'].successCount).toBe(2);
    expect(stats['home-assistant'].failureCount).toBe(1);
    expect(stats['home-assistant'].successRate).toBeCloseTo(66.67, 1);
    expect(stats['home-assistant'].feedbackStats.positive).toBe(2);
    expect(stats['home-assistant'].feedbackStats.negative).toBe(1);

    // Verificar stats de gmail
    expect(stats['gmail']).toBeDefined();
    expect(stats['gmail'].totalExecutions).toBe(1);
    expect(stats['gmail'].successCount).toBe(1);
    expect(stats['gmail'].successRate).toBe(100);
  });

  // Test 6: Sin ejecuciones
  test('should return empty array when no executions exist', async () => {
    const execs = await actionStore.getExecutions('non-existent', 'user-1');
    expect(execs).toEqual([]);
  });

  // Test 7: Feedback en ejecución no existente
  test('should handle feedback for non-existent execution gracefully', async () => {
    // No debería lanzar error
    await actionStore.recordFeedback('non-existent-exec', 'positive');

    // El estado debe ser consistent
    const stats = await actionStore.getSkillStats('user-1');
    expect(Object.keys(stats).length).toBe(0);
  });
});
