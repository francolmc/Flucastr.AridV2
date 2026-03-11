/**
 * Autonomous Event Store - Fase 10
 * 
 * Persiste:
 * - Eventos autónomos generados
 * - Feedback del usuario
 * - Historial de acciones para aprendizaje
 */

import { JSONStore } from '../storage/json-store.js';
import { logger } from '../utils/logger.js';

export interface AutonomousEvent {
  id: string;
  userId: string;
  type: 'notification' | 'reminder' | 'suggestion' | 'alert';
  skillName: string;
  triggerType: string;
  message: string;
  timestamp: Date;
  executed: boolean;
  executedAt?: Date;
  userFeedback?: 'useful' | 'not_useful' | 'execute' | 'cancel';
  feedbackAt?: Date;
}

export class AutonomousEventStore {
  constructor(private store: JSONStore) {}

  /**
   * Obtiene todos los eventos de un usuario
   */
  private loadUserEvents(userId: string): AutonomousEvent[] {
    try {
      // Placeholder: en futuras fases, JSONStore tendrá métodos specific para autonomous events
      return [];
    } catch {
      logger.warn('Failed to load user events', { userId });
      return [];
    }
  }

  /**
   * Guarda eventos de un usuario
   */
  private saveUserEvents(userId: string, events: AutonomousEvent[]): void {
    try {
      // Placeholder: en futuras fases, JSONStore guardará eventos autónomos
      logger.debug('Saved autonomous events', { userId, count: events.length });
    } catch (error) {
      logger.error('Failed to save user events', { userId, error });
    }
  }

  /**
   * Registra una acción autónoma
   */
  async recordAction(userId: string, action: AutonomousEvent): Promise<void> {
    const events = this.loadUserEvents(userId);
    events.push(action);
    this.saveUserEvents(userId, events);
    logger.debug('Recorded autonomous action', { userId, actionId: action.id });
  }

  /**
   * Marca una acción como ejecutada
   */
  async markActionExecuted(actionId: string): Promise<void> {
    logger.debug('Marked action as executed', { actionId });
  }

  /**
   * Registra feedback del usuario sobre una acción autónoma
   */
  async recordFeedback(
    userId: string,
    actionId: string,
    feedback: 'useful' | 'not_useful' | 'execute' | 'cancel'
  ): Promise<void> {
    const events = this.loadUserEvents(userId);
    const action = events.find((e) => e.id === actionId);

    if (action) {
      action.userFeedback = feedback;
      action.feedbackAt = new Date();
      this.saveUserEvents(userId, events);
      logger.debug('Recorded user feedback', { userId, actionId, feedback });
    } else {
      logger.warn('Action not found for feedback', { userId, actionId });
    }
  }

  /**
   * Obtiene estadísticas de acciones para un usuario
   */
  async getUserStats(userId: string): Promise<{
    totalActions: number;
    executedActions: number;
    usefulFeedback: number;
    notUsefulFeedback: number;
    successRate: number;
  }> {
    const events = this.loadUserEvents(userId);

    const executed = events.filter((e) => e.executed).length;
    const useful = events.filter((e) => e.userFeedback === 'useful').length;
    const notUseful = events.filter((e) => e.userFeedback === 'not_useful').length;

    return {
      totalActions: events.length,
      executedActions: executed,
      usefulFeedback: useful,
      notUsefulFeedback: notUseful,
      successRate: events.length > 0 ? executed / events.length : 0,
    };
  }

  /**
   * Obtiene eventos recientes de un usuario
   */
  async getRecentEvents(userId: string, limit: number = 10): Promise<AutonomousEvent[]> {
    const events = this.loadUserEvents(userId);
    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
  }
}
