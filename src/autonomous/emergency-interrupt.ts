import { logger } from '../utils/logger.js';
import { InterruptionPolicyStore } from './interruption-policy.store.js';

export type EmergencySeverity = 'critical' | 'high' | 'normal';

export interface EmergencyEvent {
  id: string;
  userId: string;
  severity: EmergencySeverity;
  title: string;
  description: string;
  source: string; // 'skill_error', 'deadline_now', 'event_starting', etc
  timestamp: Date;
  shouldBypassQuietMode: boolean; // ¿Interrumpir incluso en "no molestar"?
  metadata?: Record<string, any>;
}

export interface EmergencyDecision {
  shouldInterrupt: boolean;
  reason: string;
  reason_es: string;
  canDelay: boolean; // ¿Se puede posponer?
  delayMinutes?: number; // Si se puede posponer, cuántos minutos
}

export class EmergencyInterruptHandler {
  constructor(private interruptionPolicyStore: InterruptionPolicyStore) {}

  async evaluateEmergency(event: EmergencyEvent): Promise<EmergencyDecision> {
    // CRITICAL: Siempre interrumpir
    if (event.severity === 'critical') {
      return {
        shouldInterrupt: true,
        reason: 'Critical emergency - must interrupt immediately',
        reason_es: 'Emergencia crítica - interrumpir inmediatamente',
        canDelay: false,
      };
    }

    if (event.severity === 'high') {
      const policy = await this.interruptionPolicyStore.getPolicy(event.userId);
      const now = new Date();
      const currentHour = now.getHours().toString().padStart(2, '0');
      const currentMinute = now.getMinutes().toString().padStart(2, '0');
      const currentTime = `${currentHour}:${currentMinute}`;
      const inQuietHours = this.isInTimeRange(
        currentTime,
        policy.quietHours.start,
        policy.quietHours.end
      );

      if (inQuietHours && !event.shouldBypassQuietMode) {
        return {
          shouldInterrupt: false,
          reason: 'High priority but quiet hours are active',
          reason_es: 'Prioritario pero está en quiet hours',
          canDelay: true,
          delayMinutes: 30,
        };
      }

      return {
        shouldInterrupt: true,
        reason: 'High priority emergency',
        reason_es: 'Emergencia de alta prioridad',
        canDelay: true,
        delayMinutes: 10,
      };
    }

    // NORMAL: Respeta políticas estándar (no debería llegar acá)
    return {
      shouldInterrupt: false,
      reason: 'Normal priority - use standard interruption policies',
      reason_es: 'Prioridad normal - usar políticas estándar',
      canDelay: true,
    };
  }

  private isInTimeRange(currentTime: string, start: string, end: string): boolean {
    const [currentHour, currentMinute] = currentTime.split(':').map(Number);
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);

    const currentTotalMinutes = currentHour * 60 + currentMinute;
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;
    if (startTotalMinutes > endTotalMinutes) {
      return currentTotalMinutes >= startTotalMinutes || currentTotalMinutes < endTotalMinutes;
    }

    // Rango normal
    return currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes;
  }

  /**
   * Registra una emergencia para tracking
   */
  recordEmergency(userId: string, event: EmergencyEvent): void {
    try {
      // TODO: Guardar en store para analytics
      logger.info('Emergency event recorded', {
        userId,
        severity: event.severity,
        source: event.source,
        timestamp: event.timestamp,
      });
    } catch (error) {
      logger.error('Error recording emergency', { userId, error });
    }
  }

  /**
   * Determina si un evento es una emergencia (helper)
   */
  isEmergency(source: string, metadata?: Record<string, any>): EmergencySeverity {
    // Errores críticos de skills
    if (source === 'skill_error') {
      return metadata?.critical ? 'critical' : 'high';
    }

    // Deadline comenzando AHORA
    if (source === 'deadline_now') {
      return 'critical';
    }

    // Evento importante comenzando en 5 minutos
    if (source === 'event_starting_soon') {
      return 'high';
    }

    // Fallo de autenticación crítico
    if (source === 'auth_failure_critical') {
      return 'critical';
    }

    // Alert de skill (Github security, etc)
    if (source === 'skill_alert') {
      return metadata?.severity === 'critical' ? 'critical' : 'high';
    }

    return 'normal';
  }

  /**
   * Crea un evento de emergencia desde fuente
   */
  createEmergencyEvent(
    userId: string,
    source: string,
    title: string,
    description: string,
    metadata?: Record<string, any>
  ): EmergencyEvent {
    const severity = this.isEmergency(source, metadata);

    return {
      id: `emergency-${userId}-${Date.now()}`,
      userId,
      severity,
      title,
      description,
      source,
      timestamp: new Date(),
      shouldBypassQuietMode: severity === 'critical',
      metadata,
    };
  }
}
