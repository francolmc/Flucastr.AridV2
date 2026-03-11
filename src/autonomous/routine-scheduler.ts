/**
 * Routine Scheduler - Determina cuándo ejecutar rutinas matutinas/nocturnas
 * Fase 10 PASO 7: Morning/Evening Routines
 *
 * Responsabilidades:
 * 1. Predecir cuándo el usuario típicamente despierta (basado en patrones)
 * 2. Predecir cuándo el usuario típicamente duerme
 * 3. Calcular timing para afternoon checks y weekly planning
 * 4. Retornar confidence scores para decisiones
 */

import { RoutineType, DailyRoutine, RoutineConfig } from '../config/types.js';
import { PatternDetector } from './pattern-detector.js';
import { UserContextStore } from './user-context.store.js';
import { logger } from '../utils/logger.js';

export interface RoutineScheduleResult {
  routineType: RoutineType;
  predictedTime: Date;
  confidence: number;          // 0.0-1.0
  reasoning: string;           // Por qué este horario
  shouldExecuteNow: boolean;   // ¿Ejecutar ahora?
}

export class RoutineScheduler {
  private readonly MORNING_WINDOW_HOURS = 3;    // Rango de ±1.5 horas alrededor del tiempo predicho
  private readonly EVENING_WINDOW_HOURS = 2;

  constructor(
    private patternDetector: PatternDetector,
    private userContextStore: UserContextStore
  ) {}

  /**
   * Calcula el horario predicho para una rutina matutina
   * Basado en patrones de actividad del usuario
   */
  calculateMorningRoutineTime(
    userId: string,
    config: RoutineConfig
  ): RoutineScheduleResult {
    logger.debug('Calculating morning routine time', { userId });

    // Si el usuario prefiere un horario específico, usar ese
    if (config.morningPreferredTime && !config.usePatternTiming) {
      const predictedTime = this.parseTimeOfDay(config.morningPreferredTime);
      return {
        routineType: 'morning',
        predictedTime,
        confidence: 0.8,
        reasoning: 'User-specified morning time',
        shouldExecuteNow: this.isInTimeWindow(predictedTime, this.MORNING_WINDOW_HOURS),
      };
    }

    // Fallback: 7 AM default
    const defaultTime = new Date();
    defaultTime.setHours(7, 0, 0);

    return {
      routineType: 'morning',
      predictedTime: defaultTime,
      confidence: 0.3,
      reasoning: 'Using default morning time (7:00 AM)',
      shouldExecuteNow: this.isInTimeWindow(defaultTime, this.MORNING_WINDOW_HOURS),
    };
  }

  /**
   * Calcula el horario predicho para rutina nocturna
   * Basado en cuándo el usuario típicamente se desconecta
   */
  calculateEveningRoutineTime(
    userId: string,
    config: RoutineConfig
  ): RoutineScheduleResult {
    logger.debug('Calculating evening routine time', { userId });

    // Si el usuario prefiere un horario específico
    if (config.eveningPreferredTime && !config.usePatternTiming) {
      const predictedTime = this.parseTimeOfDay(config.eveningPreferredTime);
      return {
        routineType: 'evening',
        predictedTime,
        confidence: 0.8,
        reasoning: 'User-specified evening time',
        shouldExecuteNow: this.isInTimeWindow(predictedTime, this.EVENING_WINDOW_HOURS),
      };
    }

    // Fallback: 22:00 (10 PM)
    const defaultTime = new Date();
    defaultTime.setHours(22, 0, 0);

    return {
      routineType: 'evening',
      predictedTime: defaultTime,
      confidence: 0.3,
      reasoning: 'Using default evening time (22:00 PM)',
      shouldExecuteNow: this.isInTimeWindow(defaultTime, this.EVENING_WINDOW_HOURS),
    };
  }

  /**
   * Calcula horario para weekly planning (típicamente viernes)
   */
  calculateWeeklyPlanningTime(
    userId: string,
    config: RoutineConfig
  ): RoutineScheduleResult {
    const today = new Date();
    const planningDay = 5; // Friday (0=Sunday)
    const planningHour = 10; // 10 AM default

    // Calcular próxima fecha del día planeado
    const daysUntilPlanningDay = (planningDay - today.getDay() + 7) % 7 || 7;
    const nextPlanningDate = new Date(today);
    nextPlanningDate.setDate(today.getDate() + daysUntilPlanningDay);
    nextPlanningDate.setHours(planningHour, 0, 0);

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const planningDateName = dayNames[planningDay];

    return {
      routineType: 'weekly_planning',
      predictedTime: nextPlanningDate,
      confidence: 0.9,
      reasoning: `Weekly planning scheduled for ${planningDateName} at ${planningHour}:00`,
      shouldExecuteNow: this.isInTimeWindow(nextPlanningDate, 2),
    };
  }

  /**
   * Obtiene todas las rutinas programadas para hoy
   */
  getTodayRoutines(userId: string, config: RoutineConfig): DailyRoutine[] {
    const today = new Date();
    const routines: DailyRoutine[] = [];

    // Morning routine
    if (config.enableMorning) {
      const morningResult = this.calculateMorningRoutineTime(userId, config);
      routines.push({
        userId,
        routineType: 'morning',
        scheduledFor: morningResult.predictedTime,
        predictedTime: morningResult.predictedTime,
        patternConfidence: morningResult.confidence,
        executed: false,
        createdAt: new Date(),
      });
    }

    // Evening routine
    if (config.enableEvening) {
      const eveningResult = this.calculateEveningRoutineTime(userId, config);
      routines.push({
        userId,
        routineType: 'evening',
        scheduledFor: eveningResult.predictedTime,
        predictedTime: eveningResult.predictedTime,
        patternConfidence: eveningResult.confidence,
        executed: false,
        createdAt: new Date(),
      });
    }

    // Weekly planning (only if today is planning day)
    if (config.enableWeeklyPlanning && today.getDay() === 5) {
      const weeklyResult = this.calculateWeeklyPlanningTime(userId, config);
      routines.push({
        userId,
        routineType: 'weekly_planning',
        scheduledFor: weeklyResult.predictedTime,
        predictedTime: weeklyResult.predictedTime,
        patternConfidence: weeklyResult.confidence,
        executed: false,
        createdAt: new Date(),
      });
    }

    return routines;
  }

  /**
   * Verifica si ahora está dentro de la ventana de ejecución
   */
  public isInTimeWindow(targetTime: Date, windowHours: number): boolean {
    const now = new Date();
    const windowMs = windowHours * 60 * 60 * 1000;

    // Comparar solo las horas:minutos, ignorar días
    const nowTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const targetTimeStr = `${String(targetTime.getHours()).padStart(2, '0')}:${String(targetTime.getMinutes()).padStart(2, '0')}`;

    // Convertir a minutos para comparación
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const targetMinutes = targetTime.getHours() * 60 + targetTime.getMinutes();

    const diff = Math.abs(nowMinutes - targetMinutes);
    return diff <= (windowHours * 60);
  }

  /**
   * Parsea una hora en formato "HH:MM" a Date
   */
  private parseTimeOfDay(timeStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0);
    return date;
  }
}
