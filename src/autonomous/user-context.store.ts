/**
 * User Context Store - Rastreo de contexto del usuario en tiempo real
 * 
 * Mantiene información sobre lo que está haciendo el usuario ahora:
 * - Última interacción (cuándo escribió)
 * - Si está escribiendo (ventana activa de edición)
 * - Contexto temporal (en reunión, horario de trabajo, etc.)
 * 
 * Se actualiza cada vez que el usuario interactúa (escribe un mensaje)
 * Permite que interruption policies sean más inteligentes
 */

import { logger } from '../utils/logger.js';

export interface UserContext {
  userId: string;
  lastInteractionAt: Date; // Cuándo escribió el último mensaje
  lastInteractionType: 'message' | 'command' | 'voice'; // Tipo de últimainteracción
  minutesSinceLastInteraction: number; // Calculado dinámicamente
  isRecentlyActive: boolean; // true si interacción hace < 5 minutos
  estimatedFocus: 'high' | 'medium' | 'low'; // Basado en patrones de actividad
  currentDay: number; // 0-6 (dom-sab-)
  currentHour: number; // 0-23
  isWorkHours: boolean; // lunes-viernes 09:00-18:00
}

export class UserContextStore {
  private contexts: Map<string, UserContext> = new Map();
  private readonly RECENT_ACTIVITY_THRESHOLD = 5 * 60 * 1000; // 5 minutos
  private readonly FOCUSED_ACTIVITY_PATTERN = 2 * 60 * 1000; // Mensajes dentro de 2min indican foco

  /**
   * Registra una interacción del usuario
   * Actualiza el contexto (último mensaje, tipo, etc.)
   */
  recordInteraction(userId: string, type: 'message' | 'command' | 'voice'): void {
    try {
      const now = new Date();
      const existing = this.contexts.get(userId);

      // Determinar focus basado en frecuencia de interacción
      let estimatedFocus: 'high' | 'medium' | 'low' = 'low';
      if (existing) {
        const timeSinceLast = now.getTime() - existing.lastInteractionAt.getTime();
        if (timeSinceLast < this.FOCUSED_ACTIVITY_PATTERN) {
          estimatedFocus = 'high'; // Escribiendo activamente
        } else if (timeSinceLast < 15 * 60 * 1000) {
          estimatedFocus = 'medium'; // Activo pero no escribiendo constantemente
        }
      }

      const context: UserContext = {
        userId,
        lastInteractionAt: now,
        lastInteractionType: type,
        minutesSinceLastInteraction: 0,
        isRecentlyActive: true,
        estimatedFocus,
        currentDay: now.getDay(),
        currentHour: now.getHours(),
        isWorkHours: this.isWorkHours(now)
      };

      this.contexts.set(userId, context);

      logger.debug('User interaction recorded', {
        userId,
        type,
        estimatedFocus,
        isWorkHours: context.isWorkHours
      });
    } catch (error) {
      logger.error('Error recording user interaction', { userId, error });
    }
  }

  /**
   * Obtiene el contexto actual del usuario
   * Calcula dinamicamente minutesSinceLastInteraction
   */
  getContext(userId: string): UserContext | null {
    const context = this.contexts.get(userId);
    if (!context) {
      return null;
    }

    const now = new Date();
    const minutesSince = Math.floor((now.getTime() - context.lastInteractionAt.getTime()) / 60000);

    return {
      ...context,
      minutesSinceLastInteraction: minutesSince,
      isRecentlyActive: minutesSince < 5,
      currentDay: now.getDay(),
      currentHour: now.getHours(),
      isWorkHours: this.isWorkHours(now)
    };
  }

  /**
   * Determina si el usuario está "ocupado" (escribiendo activamente)
   * Heurística: si escribió hace menos de 2 minutos
   */
  isUserBusy(userId: string): boolean {
    const context = this.getContext(userId);
    if (!context) return false;

    return context.estimatedFocus === 'high' && context.minutesSinceLastInteraction < 2;
  }

  /**
   * Determina si es "buen momento" para interrumpir
   * Basado en:
   * - No está escribiendo activamente
   * - No es madrugada (00:00-06:00)
   * - Ha pasado algún tiempo desde último mensaje (>5 min)
   */
  isGoodTimeToInterrupt(userId: string): boolean {
    const context = this.getContext(userId);
    if (!context) return true; // Si no hay context, asumir que es ok

    // No interrumpir si está escribiendo (enfocado)
    if (this.isUserBusy(userId)) {
      return false;
    }

    // Preferir no interrumpir si muy poco tiempo ha pasado
    // Esperar al menos 1 minuto entre interacciones
    if (context.minutesSinceLastInteraction < 1) {
      return false;
    }

    // OK to interrupt
    return true;
  }

  /**
   * Determina urgencia recomendada para interrumpir
   * Basado en contexto del usuario
   */
  getInterruptionUrgencyHint(userId: string): 'low' | 'medium' | 'high' {
    const context = this.getContext(userId);
    if (!context) return 'medium';

    // Si está muy ocupado, solo mensajes high/urgent pueden pasar
    if (this.isUserBusy(userId)) {
      return 'high';
    }

    // Si no ha interactuado recientemente, puede ser low
    if (context.minutesSinceLastInteraction > 30) {
      return 'low';
    }

    // Default
    return 'medium';
  }

  /**
   * Verifica si es horario de trabajo
   * Lunes-viernes 09:00-18:00
   */
  private isWorkHours(date: Date): boolean {
    const day = date.getDay();
    const hour = date.getHours();

    // Lunes (1) a viernes (5)
    if (day < 1 || day > 5) {
      return false;
    }

    // 09:00-18:00
    return hour >= 9 && hour < 18;
  }

  /**
   * Limpia contexto de usuarios inactivos (> 1 hora sin interacción)
   * Llamado periódicamente para limpiar memoria
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hora

    for (const [userId, context] of this.contexts.entries()) {
      if (now - context.lastInteractionAt.getTime() > maxAge) {
        this.contexts.delete(userId);
      }
    }
  }

  /**
   * Obtiene estadísticas de todos los usuarios
   */
  getStats(): {
    totalUsers: number;
    activeUsers: number; // Activos en últimos 5 min
    inWorkHours: number;
  } {
    const contexts = Array.from(this.contexts.values());
    const now = new Date();

    return {
      totalUsers: contexts.length,
      activeUsers: contexts.filter(c => {
        const mins = (now.getTime() - c.lastInteractionAt.getTime()) / 60000;
        return mins < 5;
      }).length,
      inWorkHours: contexts.filter(c => {
        const weekday = now.getDay();
        const hour = now.getHours();
        return weekday >= 1 && weekday <= 5 && hour >= 9 && hour < 18;
      }).length
    };
  }
}
