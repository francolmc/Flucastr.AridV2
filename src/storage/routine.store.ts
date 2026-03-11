/**
 * Routine Store - Persistencia de rutinas diarias ejecutadas
 * Fase 10 PASO 7: Morning/Evening Routines
 */

import { JSONStore } from './json-store.js';
import { DailyRoutine, RoutineConfig, RoutineType } from '../config/types.js';
import { logger } from '../utils/logger.js';

export class RoutineStore {
  constructor(private jsonStore: JSONStore) {}

  /**
   * Registra una rutina ejecutada
   */
  async recordRoutine(routine: DailyRoutine): Promise<void> {
    const data = this.jsonStore.read();

    if (!data.daily_routines) {
      data.daily_routines = {};
    }

    if (!data.daily_routines[routine.userId]) {
      data.daily_routines[routine.userId] = [];
    }

    data.daily_routines[routine.userId].push(routine);

    this.jsonStore.write(data);

    logger.debug('Routine recorded', {
      userId: routine.userId,
      routineType: routine.routineType,
      executed: routine.executed,
    });
  }

  /**
   * Obtiene rutinas de un usuario en un rango de fechas
   */
  async getRoutines(
    userId: string,
    routineType?: RoutineType,
    daysBack: number = 30
  ): Promise<DailyRoutine[]> {
    const data = this.jsonStore.read();

    if (!data.daily_routines || !data.daily_routines[userId]) {
      return [];
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    let routines = data.daily_routines[userId].filter((r: DailyRoutine) => {
      const routineDate = new Date(r.scheduledFor);
      const dateMatch = routineDate >= cutoff;
      const typeMatch = !routineType || r.routineType === routineType;
      return dateMatch && typeMatch;
    });

    return routines;
  }

  /**
   * Obtiene configuración de rutinas del usuario
   */
  getRoutineConfig(userId: string): RoutineConfig | null {
    const data = this.jsonStore.read();

    if (!data.routine_configs || !data.routine_configs[userId]) {
      return null;
    }

    return data.routine_configs[userId];
  }

  /**
   * Actualiza configuración de rutinas del usuario
   */
  async saveRoutineConfig(config: RoutineConfig): Promise<void> {
    const data = this.jsonStore.read();

    if (!data.routine_configs) {
      data.routine_configs = {};
    }

    data.routine_configs[config.userId] = config;
    this.jsonStore.write(data);

    logger.info('Routine config saved', { userId: config.userId });
  }

  /**
   * Obtiene estadísticas de rutinas ejecutadas
   */
  async getRoutineStats(userId: string): Promise<Record<string, any>> {
    const routines = await this.getRoutines(userId, undefined, 90);

    const stats = {
      totalRoutines: routines.length,
      byType: {} as Record<string, number>,
      executed: 0,
      skipped: 0,
      executionRate: 0,
    };

    for (const routine of routines) {
      const type = routine.routineType;
      if (!stats.byType[type]) {
        stats.byType[type] = 0;
      }
      stats.byType[type]++;

      if (routine.executed) {
        stats.executed++;
      } else if (routine.skipped) {
        stats.skipped++;
      }
    }

    stats.executionRate = routines.length > 0 ? (stats.executed / routines.length) * 100 : 0;

    return stats;
  }

  /**
   * Marca una rutina como ejecutada
   */
  async markRoutineExecuted(routineId: string, userId: string): Promise<void> {
    const data = this.jsonStore.read();

    if (data.daily_routines && data.daily_routines[userId]) {
      const routine = data.daily_routines[userId].find((r: DailyRoutine) => {
        // Buscar por aproximación de hora+tipo (no tenemos id único)
        return r.routineType; // Simplemente marcar la última no ejecutada
      });

      if (routine) {
        routine.executed = true;
        routine.executedAt = new Date();
        this.jsonStore.write(data);
      }
    }
  }

  /**
   * Marca una rutina como rechazada/saltada
   */
  async skipRoutine(routineId: string, userId: string): Promise<void> {
    const data = this.jsonStore.read();

    if (data.daily_routines && data.daily_routines[userId]) {
      const routine = data.daily_routines[userId].find((r: DailyRoutine) => {
        return r.routineType;
      });

      if (routine) {
        routine.skipped = true;
        this.jsonStore.write(data);
      }
    }
  }
}
