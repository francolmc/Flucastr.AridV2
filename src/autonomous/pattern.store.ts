/**
 * Pattern Store - Persistencia de patrones detectados
 * 
 * Almacena patrones de conducta del usuario:
 * - Rutinas temporales
 * - Actividades frecuentes
 * Permite recuperar y actualizar patrones para futuras detecciones
 */

import { JSONStore } from '../storage/json-store.js';
import { logger } from '../utils/logger.js';

export interface UserPattern {
  id: string;
  userId: string;
  patternType: 'morning_routine' | 'work_start' | 'break_time' | 'evening_check' | 'activity_pattern' | 'custom';
  description: string;
  typicalTime?: string; // "07:00" o "14:30"
  typicalDays?: number[]; // [0,1,2,3,4,5,6] = dom-sab
  keywords?: string[]; // Palabras clave detectadas en esta rutina
  actions?: string[]; // Acciones/intenciones típicas
  confidence: number; // 0.0-1.0
  lastDetected: Date;
  detectionCount: number;
  nextPredictedTime?: Date; // Próxima predicción de cuándo ocurrirá
}

export class PatternStore {
  constructor(private store: JSONStore) {}

  /**
   * Obtiene todos los patrones de un usuario
   */
  getPatterns(userId: string): UserPattern[] {
    try {
      const data = this.store.read();
      const userPatterns = (data.patterns?.[userId] || []) as UserPattern[];
      return userPatterns.map(p => ({
        ...p,
        lastDetected: new Date(p.lastDetected as any)
      }));
    } catch (error) {
      logger.warn('Error getting patterns', { userId, error });
      return [];
    }
  }

  /**
   * Obtiene un patrón específico
   */
  getPattern(userId: string, patternId: string): UserPattern | null {
    const patterns = this.getPatterns(userId);
    return patterns.find(p => p.id === patternId) || null;
  }

  /**
   * Guarda o actualiza un patrón
   */
  savePattern(pattern: UserPattern): void {
    try {
      const data = this.store.read();
      if (!data.patterns) data.patterns = {};
      if (!data.patterns[pattern.userId]) data.patterns[pattern.userId] = [];

      // Buscar patrón existente
      const existingIndex = data.patterns[pattern.userId].findIndex(
        (p: UserPattern) => p.id === pattern.id
      );

      if (existingIndex >= 0) {
        // Actualizar: incrementar conteo, actualizar timestamp
        data.patterns[pattern.userId][existingIndex] = {
          ...data.patterns[pattern.userId][existingIndex],
          ...pattern,
          detectionCount: (data.patterns[pattern.userId][existingIndex].detectionCount || 0) + 1,
          lastDetected: new Date()
        };
      } else {
        // Crear nuevo
        data.patterns[pattern.userId].push({
          ...pattern,
          detectionCount: 1,
          lastDetected: new Date()
        });
      }

      this.store.write(data);
      logger.debug('Pattern saved', {
        userId: pattern.userId,
        patternId: pattern.id,
        type: pattern.patternType
      });
    } catch (error) {
      logger.error('Error saving pattern', { userId: pattern.userId, error });
    }
  }

  /**
   * Elimina un patrón
   */
  deletePattern(userId: string, patternId: string): void {
    try {
      const data = this.store.read();
      if (!data.patterns?.[userId]) return;

      data.patterns[userId] = data.patterns[userId].filter(
        (p: UserPattern) => p.id !== patternId
      );

      this.store.write(data);
      logger.debug('Pattern deleted', { userId, patternId });
    } catch (error) {
      logger.error('Error deleting pattern', { userId, patternId, error });
    }
  }

  /**
   * Obtiene patrones más confiables (>= umbral)
   */
  getConfidentPatterns(userId: string, minConfidence: number = 0.7): UserPattern[] {
    return this.getPatterns(userId).filter(p => p.confidence >= minConfidence);
  }

  /**
   * Obtiene patrones que probablemente ocurran al tiempo actual
   */
  getApplicablePatterns(userId: string): UserPattern[] {
    const patterns = this.getPatterns(userId);
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    return patterns.filter(pattern => {
      // Verificar confianza mínima
      if (pattern.confidence < 0.6) return false;

      // Verificar hora
      if (pattern.typicalTime) {
        const [hour] = pattern.typicalTime.split(':').map(Number);
        const hourWindowStart = hour * 60;
        const hourWindowEnd = (hour + 1) * 60;
        const currentTimeMinutes = currentHour * 60 + now.getMinutes();

        if (
          currentTimeMinutes < hourWindowStart ||
          currentTimeMinutes >= hourWindowEnd
        ) {
          return false;
        }
      }

      // Verificar día (si está especificado)
      if (pattern.typicalDays && !pattern.typicalDays.includes(currentDay)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Obtiene patrones ordenados por confianza
   */
  getPatternsByConfidence(userId: string): UserPattern[] {
    return this.getPatterns(userId).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Estadísticas de patrones
   */
  getPatternStats(userId: string): {
    total: number;
    byType: Record<string, number>;
    averageConfidence: number;
    mostFrequent: UserPattern | null;
  } {
    const patterns = this.getPatterns(userId);

    const byType: Record<string, number> = {};
    patterns.forEach(p => {
      byType[p.patternType] = (byType[p.patternType] || 0) + 1;
    });

    const averageConfidence =
      patterns.length > 0
        ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
        : 0;

    const mostFrequent =
      patterns.length > 0
        ? patterns.reduce((prev, current) =>
            current.detectionCount > prev.detectionCount ? current : prev
          ) || null
        : null;

    return {
      total: patterns.length,
      byType,
      averageConfidence,
      mostFrequent
    };
  }
}
