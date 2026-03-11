/**
 * Routine Generator - Crea contenido contextual para rutinas diarias
 * Fase 10 PASO 7: Morning/Evening Routines
 *
 * Genera:
 * - Buenos días personalizados
 * - Evening checks
 * - Daily summaries
 * - Weekly planning suggestions
 */

import { RoutineType, RoutineConfig, DailyRoutine } from '../config/types.js';
import { ProspectiveMemoryStore } from '../storage/prospective-memory.store.js';
import { PatternDetector } from './pattern-detector.js';
import { SkillStore } from '../storage/skill.store.js';
import { logger } from '../utils/logger.js';

export interface RoutineContent {
  title: string;
  message: string;
  items: string[]; // Elementos específicos (tareas, reminders, etc)
  metadata?: Record<string, any>;
}

export class RoutineGenerator {
  constructor(
    private prospectiveStore: ProspectiveMemoryStore,
    private patternDetector: PatternDetector,
    private skillStore: SkillStore
  ) {}

  /**
   * Genera mensaje de buenos días personalizado
   */
  generateMorningRoutine(
    userId: string,
    config: RoutineConfig
  ): RoutineContent {
    logger.debug('Generating morning routine', { userId });

    const items: string[] = [];
    const overdue = this.prospectiveStore.getOverdue(userId);
    const upcoming = this.prospectiveStore.getUpcoming(userId, 1);

    // 1. Saludar personalizadamente
    const greetings = [
      '🌅 Buenos días! ¿Cómo estamos hoy?',
      '☀️ ¡Un nuevo día comienza!',
      '🌞 ¡Buen día! Hora de activarse.',
      '😊 ¡Hola! El día es tuyo.',
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];

    // 2. Recordar tareas vencidas
    if (overdue.length > 0) {
      items.push(`⚠️ Tienes ${overdue.length} tarea(s) vencida(s) pendiente(s)`);
    }

    // 3. Alertar sobre eventos próximos
    if (upcoming.length > 0) {
      const upcomingStr = upcoming
        .map((m: any) => {
          const time = m.dueTime || 'todo el día';
          return `• ${m.content} (${time})`;
        })
        .join('\n');
      items.push(`📅 Hoy tienes:\n${upcomingStr}`);
    }

    const message = greeting;

    return {
      title: '🌅 Buenos Días',
      message,
      items,
      metadata: {
        overdueTasks: overdue.length,
        upcomingTasks: upcoming.length,
      },
    };
  }

  /**
   * Genera check nocturno ("¿qué tal pasó el día?")
   */
  generateEveningRoutine(
    userId: string,
    config: RoutineConfig
  ): RoutineContent {
    logger.debug('Generating evening routine', { userId });

    const items: string[] = [];
    const upcoming = this.prospectiveStore.getUpcoming(userId, 1);

    // 1. Greeting vespertino
    const eveningGreetings = [
      '🌙 Buenas noches. Hora de reflexionar sobre el día.',
      '🌆 Atardecer. ¿Qué lograste hoy?',
      '✨ Noche. Momento de descansar.',
    ];
    const greeting = eveningGreetings[Math.floor(Math.random() * eveningGreetings.length)];

    // 2. Dar contexto del día
    items.push('💭 Reflexión del día:');
    items.push('• ¿Qué te dio energía hoy?');
    items.push('• ¿Qué aprendiste?');

    // 3. Preview de mañana
    if (upcoming.length > 0) {
      items.push(`\n📅 Mañana tendrás ${upcoming.length} evento(s) importante(s)`);
    }

    return {
      title: '🌙 Buenas Noches',
      message: greeting,
      items,
      metadata: {
        upcomingCount: upcoming.length,
      },
    };
  }

  /**
   * Genera resumen diario
   */
  generateDailySummary(
    userId: string,
    config: RoutineConfig
  ): RoutineContent {
    logger.debug('Generating daily summary', { userId });

    const items: string[] = [];
    const completed = this.prospectiveStore.getCompleted(userId);
    const pending = this.prospectiveStore.getPending(userId);

    items.push(`✅ Completadas: ${completed.length}`);
    items.push(`⏳ Pendientes: ${pending.length}`);

    if (completed.length > 0) {
      items.push(`\n🎯 Hoy completaste:`);
      completed.slice(0, 3).forEach((task: any) => {
        items.push(`  ✓ ${task.content}`);
      });
    }

    return {
      title: '📊 Resumen del Día',
      message: 'Aquí está tu resumen de productividad',
      items,
      metadata: {
        completedCount: completed.length,
        pendingCount: pending.length,
      },
    };
  }

  /**
   * Genera sugerencias para planificación semanal
   */
  generateWeeklyPlanning(
    userId: string,
    config: RoutineConfig
  ): RoutineContent {
    logger.debug('Generating weekly planning', { userId });

    const items: string[] = [];
    const upcoming = this.prospectiveStore.getUpcoming(userId, 7);

    items.push('📆 Semana a la vista:');
    items.push(`  • Total de eventos: ${upcoming.length}`);
    items.push('  • Prioridades:');
    items.push('    1. Completar tareas vencidas');
    items.push('    2. Preparar eventos de la semana');
    items.push('    3. Actualizar patrones de comportamiento');

    items.push('\n🎯 ¿Cuál es tu prioridad para esta semana?');

    return {
      title: '📋 Planificación Semanal',
      message: 'Es hora de planificar la semana',
      items,
      metadata: {
        upcomingCount: upcoming.length,
      },
    };
  }

  /**
   * Dispatcher: Genera contenido basado en tipo de rutina
   */
  generateRoutineContent(routine: DailyRoutine, config: RoutineConfig): RoutineContent {
    switch (routine.routineType) {
      case 'morning':
        return this.generateMorningRoutine(routine.userId, config);
      case 'evening':
        return this.generateEveningRoutine(routine.userId, config);
      case 'afternoon_check':
        return this.generateDailySummary(routine.userId, config);
      case 'weekly_planning':
        return this.generateWeeklyPlanning(routine.userId, config);
      default:
        return {
          title: 'Rutina',
          message: 'Rutina programada',
          items: [],
        };
    }
  }
}
