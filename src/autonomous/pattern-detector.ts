/**
 * Pattern Detector - Fase 10
 * 
 * Detecta patrones en el comportamiento del usuario:
 * - Rutinas temporales (café a las 7 AM los lunes)
 * - Patrones de actividad (revisa GitHub después de almorzar)
 * - Preferencias contextuales
 * 
 * GENÉRICO: No hardcodea actividades específicas
 * Analiza palabras clave, contexto, y temporal patterns
 */

import { ConversationStore } from '../storage/conversation.store.js';
import { PatternStore, UserPattern } from './pattern.store.js';
import { logger } from '../utils/logger.js';

export class PatternDetector {
  constructor(
    private conversationStore: ConversationStore,
    private patternStore: PatternStore
  ) {}

  /**
   * Detecta si hay un patrón que coincida con el momento actual
   * Retorna el patrón más confiable si lo hay, null si no
   */
  async detectCurrentPattern(userId: string): Promise<UserPattern | null> {
    try {
      // Obtener patrones que pueden aplicarse ahora
      const applicablePatterns = this.patternStore.getApplicablePatterns(userId);

      if (applicablePatterns.length === 0) {
        return null;
      }

      // Retornar el más confiable
      return applicablePatterns.sort((a, b) => b.confidence - a.confidence)[0];
    } catch (error) {
      logger.error('Error detecting current pattern', { userId, error });
      return null;
    }
  }

  /**
   * Analiza el historial de conversaciones para detectar patrones
   * Busca:
   * 1. Horas recurrentes de actividad
   * 2. Días de la semana con actividad
   * 3. Palabras clave/intenciones recurrentes
   * 4. Secuencias de acciones
   */
  async analyzeConversationHistory(userId: string): Promise<UserPattern[]> {
    try {
      const messages = this.conversationStore.getHistory(userId, 100);
      const detectedPatterns: UserPattern[] = [];

      if (messages.length < 10) {
        logger.debug('Not enough messages to analyze patterns', {
          userId,
          messageCount: messages.length
        });
        return [];
      }

      // Análisis 1: Patrones temporales (hora y día)
      const temporalPatterns = this.analyzeTemporalPatterns(userId, messages);
      detectedPatterns.push(...temporalPatterns);

      // Análisis 2: Patrones de actividad (palabras clave recurrentes)
      const activityPatterns = this.analyzeActivityPatterns(userId, messages);
      detectedPatterns.push(...activityPatterns);

      // Guardar todos los patrones detectados
      for (const pattern of detectedPatterns) {
        this.patternStore.savePattern(pattern);
      }

      logger.info('Conversation history analyzed for patterns', {
        userId,
        patternsFound: detectedPatterns.length,
        messageCount: messages.length
      });

      return detectedPatterns;
    } catch (error) {
      logger.error('Error analyzing conversation history', { userId, error });
      return [];
    }
  }

  /**
   * Analiza patrones temporales:
   * - Horas del día más activas
   * - Días de semana más activos
   */
  private analyzeTemporalPatterns(userId: string, messages: any[]): UserPattern[] {
    const patterns: UserPattern[] = [];

    // Agrupar mensajes por hora
    const messagesByHour = new Map<number, { count: number; days: number[] }>();
    const messagesByDayOfWeek = new Map<number, number>();

    for (const msg of messages) {
      if (msg.role !== 'user') continue;

      const date = new Date(msg.timestamp);
      const hour = date.getHours();
      const day = date.getDay();

      // Track por hora
      const hourData = messagesByHour.get(hour) || { count: 0, days: [] };
      hourData.count++;
      if (!hourData.days.includes(day)) hourData.days.push(day);
      messagesByHour.set(hour, hourData);

      // Track por día de semana
      messagesByDayOfWeek.set(day, (messagesByDayOfWeek.get(day) || 0) + 1);
    }

    // Detectar horas más activas
    const sortedHours = Array.from(messagesByHour.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3);

    for (const [hour, data] of sortedHours) {
      const confidence = Math.min(1.0, data.count / messages.length);

      // Solo crear patrón si hay confianza suficiente (>= 20% de actividad)
      if (confidence >= 0.2) {
        const patternType = this.classifyHourOfDay(hour);
        
        const pattern: UserPattern = {
          id: `temporal-${hour}-${Date.now()}`,
          userId,
          patternType: patternType as any,
          description: `User typically active around ${String(hour).padStart(2, '0')}:00`,
          typicalTime: `${String(hour).padStart(2, '0')}:00`,
          typicalDays: data.days.length > 0 ? data.days : undefined,
          confidence,
          lastDetected: new Date(),
          detectionCount: 0
        };

        patterns.push(pattern);
      }
    }

    return patterns;
  }

  /**
   * Analiza patrones de actividad (palabras clave, intenciones)
   * Busca palabras clave frecuentes y agrupa por hora
   */
  private analyzeActivityPatterns(userId: string, messages: any[]): UserPattern[] {
    const patterns: UserPattern[] = [];

    // Keywords genéricos para diferentes tipos de actividades
    const activityKeywords = {
      code_activity: ['github', 'código', 'commit', 'pull', 'issue', 'branch', 'merge', 'repo'],
      admin_activity: ['crear', 'actualizar', 'setup', 'configurar', 'instalar', 'deploy'],
      research_activity: ['search', 'buscar', 'investigar', 'investigación', 'check'],
      communication: ['email', 'mensaje', 'slack', 'telegram', 'responder', 'contacto'],
      planning_activity: ['plan', 'agenda', 'tarea', 'hacer', 'siguiente', 'próximo']
    };

    // Agrupar mensajes por actividad
    const activityByHour = new Map<number, Map<string, number>>();

    for (const msg of messages) {
      if (msg.role !== 'user') continue;

      const content = msg.content.toLowerCase();
      const date = new Date(msg.timestamp);
      const hour = date.getHours();

      if (!activityByHour.has(hour)) {
        activityByHour.set(hour, new Map());
      }

      const hourActivities = activityByHour.get(hour)!;

      // Detectar qué tipo de actividad es por keywords
      for (const [activityType, keywords] of Object.entries(activityKeywords)) {
        for (const keyword of keywords) {
          if (content.includes(keyword)) {
            const count = hourActivities.get(activityType) || 0;
            hourActivities.set(activityType, count + 1);
          }
        }
      }
    }

    // Crear patrones por cada hora + actividad significativa
    for (const [hour, activities] of activityByHour.entries()) {
      const sortedActivities = Array.from(activities.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 1); // Top 1 actividad para la hora

      if (sortedActivities.length > 0) {
        const [activityType, count] = sortedActivities[0];
        const confidence = Math.min(1.0, count / 3); // Normalizar: 3+ mensajes = alta confianza

        if (confidence >= 0.3) {
          const pattern: UserPattern = {
            id: `activity-${activityType}-${hour}-${Date.now()}`,
            userId,
            patternType: 'activity_pattern' as const,
            description: `User typically does ${activityType.replace('_', ' ')} around ${String(hour).padStart(2, '0')}:00`,
            typicalTime: `${String(hour).padStart(2, '0')}:00`,
            keywords: [activityType],
            confidence,
            lastDetected: new Date(),
            detectionCount: 0
          };

          patterns.push(pattern);
        }
      }
    }

    return patterns;
  }

  /**
   * Clasifica la hora del día en patrones conocidos
   * GENÉRICO: No assume nombres específicos de patrones
   */
  private classifyHourOfDay(
    hour: number
  ): 'morning_routine' | 'work_start' | 'break_time' | 'evening_check' | 'custom' {
    if (hour >= 6 && hour < 9) return 'morning_routine';
    if (hour >= 9 && hour < 12) return 'work_start';
    if (hour >= 12 && hour < 15) return 'break_time';
    if (hour >= 18 && hour < 22) return 'evening_check';
    return 'custom';
  }

  /**
   * Obtiene patrones para un usuario (desde PatternStore)
   */
  getStoredPatterns(userId: string): UserPattern[] {
    return this.patternStore.getPatterns(userId);
  }

  /**
   * Obtiene patrones más confiables
   */
  getConfidentPatterns(userId: string, minConfidence: number = 0.65): UserPattern[] {
    return this.patternStore.getConfidentPatterns(userId, minConfidence);
  }

  /**
   * Ejecuta análisis completo (periódicamente)
   * Actualiza todos los patrones y retorna detecciones nuevas
   */
  async refreshPatterns(userId: string): Promise<UserPattern[]> {
    logger.debug('Refreshing patterns analysis', { userId });
    return await this.analyzeConversationHistory(userId);
  }
}
