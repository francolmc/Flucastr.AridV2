/**
 * Interruption Policy Store - Fase 10
 * 
 * Mantiene políticas de interrupción para cada usuario:
 * - Quiet hours (no interrumpir de 00:00-06:00)
 * - Do not disturb mode
 * - Rate limiting (máx notificaciones/hora)
 * - Urgency classification
 */

import { JSONStore } from '../storage/json-store.js';
import { logger } from '../utils/logger.js';
import { UserContextStore } from './user-context.store.js';

export interface InterruptionPolicy {
  userId: string;
  doNotDisturb: boolean; // Global "silenciar todo"
  quietHours: {
    start: string; // "00:00"
    end: string; // "06:00"
  };
  maxNotificationsPerHour: number; // Default: 3
  allowUrgent: boolean; // Permitir alertas en quiet hours si son urgentes
  eventTypePreferences?: Record<string, 'always' | 'important_only' | 'urgent_only' | 'never'>; // Per-event-type rules
  lastNotificationTimes: Date[]; // Para rate limiting
  lastNotificationByType?: Record<string, Date>; // Per-type rate limiting (PASO 5)
  createdAt: Date;
  updatedAt: Date;
}

export class InterruptionPolicyStore {
  private defaultPolicy: Partial<InterruptionPolicy> = {
    doNotDisturb: false,
    quietHours: {
      start: '00:00',
      end: '06:00',
    },
    maxNotificationsPerHour: 3,
    allowUrgent: true,
  };

  constructor(private store: JSONStore, private userContextStore: UserContextStore) {}

  /**
   * Obtiene la política de interrupción de un usuario
   * (O crea una por defecto si no existe)
   */
  async getPolicy(userId: string): Promise<InterruptionPolicy> {
    try {
      // Placeholder: en futuras fases, JSONStore tendrá métodos para interruption policies
      const defaultPol: InterruptionPolicy = {
        userId,
        ...this.defaultPolicy,
        lastNotificationTimes: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as InterruptionPolicy;

      return defaultPol;
    } catch (error) {
      logger.error('Failed to load interruption policy', { userId, error });
      throw error;
    }
  }

  /**
   * Actualiza una política de interrupción
   */
  async updatePolicy(userId: string, updates: Partial<InterruptionPolicy>): Promise<void> {
    try {
      // Placeholder para futuras fases
      logger.debug('Updated interruption policy', { userId });
    } catch (error) {
      logger.error('Failed to update interruption policy', { userId, error });
      throw error;
    }
  }

  /**
   * Determina si puede interrumpir ahora
   * Valida:
   * - Si doNotDisturb está activo
   * - Si estamos en quiet hours
   * - Si no excedemos rate limit
   * - Si usuario está ocupado (escribiendo)
   * - Por-event-type preferences
   */
  async canInterrupt(
    userId: string,
    urgency: 'normal' | 'important' | 'urgent' = 'normal',
    eventType?: string
  ): Promise<boolean> {
    try {
      const policy = await this.getPolicy(userId);

      // 1. Si doNotDisturb, solo urgentes pueden pasar
      if (policy.doNotDisturb && urgency === 'normal') {
        logger.debug('Blocked by do-not-disturb', { userId });
        return false;
      }

      // 2. Revisar quiet hours
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}`;
      const inQuietHours = this.isInTimeRange(
        currentTime,
        policy.quietHours.start,
        policy.quietHours.end
      );

      if (inQuietHours) {
        // En quiet hours, solo urgentes pueden pasar si allowUrgent = true
        if (urgency !== 'urgent' || !policy.allowUrgent) {
          logger.debug('Blocked by quiet hours', { userId, currentTime });
          return false;
        }
      }

      // 3. Revisar rate limit
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const recentNotifications = (policy.lastNotificationTimes || []).filter(
        (time) => new Date(time) > oneHourAgo
      );

      if (recentNotifications.length >= policy.maxNotificationsPerHour) {
        logger.debug('Blocked by rate limit', { userId, recent: recentNotifications.length });
        return false;
      }

      // 4. PASO 5: Revisar user context
      // Si usuario está escribiendo (enfocado), solo urgentes pueden pasar
      const userContext = this.userContextStore.getContext(userId);
      if (userContext && this.userContextStore.isUserBusy(userId)) {
        if (urgency === 'normal') {
          logger.debug('Blocked: user is busy (writing)', { userId });
          return false;
        }
      }

      // 5. PASO 5: Revisar per-event-type preference
      if (eventType) {
        const typeOk = await this.checkEventTypePreference(userId, eventType, urgency);
        if (!typeOk) {
          logger.debug('Blocked by event-type preference', { userId, eventType, urgency });
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Error checking interruption capability', { userId, error });
      return false; // En duda, no interrumpir
    }
  }

  /**
   * Registra que enviamos una notificación
   * (Para rate limiting)
   */
  async recordNotification(userId: string, eventType?: string): Promise<void> {
    try {
      const policy = await this.getPolicy(userId);
      const times = policy.lastNotificationTimes || [];

      // Limpiar notificaciones older than 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentTimes = times.filter((time) => new Date(time) > oneHourAgo);

      recentTimes.push(new Date());

      // PASO 5: Registrar por tipo de evento también
      const updatedPolicy: Partial<InterruptionPolicy> = { lastNotificationTimes: recentTimes };
      
      if (eventType) {
        const byType = policy.lastNotificationByType || {};
        byType[eventType] = new Date();
        updatedPolicy.lastNotificationByType = byType;
      }

      await this.updatePolicy(userId, updatedPolicy);
      logger.debug('Recorded notification for rate limiting', { userId, recent: recentTimes.length, eventType });
    } catch (error) {
      logger.error('Failed to record notification', { userId, error });
    }
  }

  /**
   * Verifica si podemos interrumpir por tipo de evento
   * PASO 5: Permite configuración por evento type
   */
  async checkEventTypePreference(
    userId: string,
    eventType: string,
    urgency: 'normal' | 'important' | 'urgent'
  ): Promise<boolean> {
    try {
      const policy = await this.getPolicy(userId);
      const preferences = policy.eventTypePreferences || {};
      const preference = preferences[eventType];

      if (!preference) {
        // Default: permitir todos
        return true;
      }

      // Matriz de preferencias
      switch (preference) {
        case 'always':
          return true;
        case 'important_only':
          return urgency !== 'normal';
        case 'urgent_only':
          return urgency === 'urgent';
        case 'never':
          return false;
        default:
          return true;
      }
    } catch (error) {
      logger.error('Failed to check event type preference', { userId, eventType, error });
      return true; // Default: permitir
    }
  }

  /**
   * Obtiene el tiempo desde la última notificación de un tipo específico
   * PASO 5: Para smart rate limiting por tipo
   */
  async getTimeSinceLastNotification(userId: string, eventType: string): Promise<number> {
    try {
      const policy = await this.getPolicy(userId);
      const lastTime = policy.lastNotificationByType?.[eventType];

      if (!lastTime) {
        return Infinity; // Nunca se notificó
      }

      return Date.now() - new Date(lastTime).getTime();
    } catch (error) {
      logger.error('Failed to get time since last notification', { userId, eventType, error });
      return Infinity;
    }
  }

  /**
   * Activa/desactiva do-not-disturb
   */
  async setDoNotDisturb(userId: string, value: boolean): Promise<void> {
    await this.updatePolicy(userId, { doNotDisturb: value });
    logger.info('Do-not-disturb updated', { userId, value });
  }

  /**
   * Actualiza quiet hours
   */
  async setQuietHours(userId: string, start: string, end: string): Promise<void> {
    await this.updatePolicy(userId, { quietHours: { start, end } });
    logger.info('Quiet hours updated', { userId, start, end });
  }

  /**
   * Helper: verifica si una hora está en un rango
   * start="00:00", end="06:00" → true si son las 02:00
   * Nota: maneja el caso especial donde end < start (ej: 22:00 - 06:00)
   */
  private isInTimeRange(currentTime: string, start: string, end: string): boolean {
    const [curHour, curMin] = currentTime.split(':').map(Number);
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);

    const currentMinutes = curHour * 60 + curMin;
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes < endMinutes) {
      // Range normal: 08:00 - 17:00
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Range que cruza medianoche: 22:00 - 06:00
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }
}
