import { logger } from '../utils/logger.js';
import { JSONStore } from '../storage/json-store.js';

export type FeedbackType = 'useful' | 'not_useful' | 'execute' | 'cancel' | 'no_response';
export type FeedbackContext = 'morning_routine' | 'autonomous_action' | 'reminder' | 'suggestion';

export interface UserFeedback {
  userId: string;
  actionId: string;
  feedbackType: FeedbackType;
  context: FeedbackContext;
  timestamp: Date;
  metadata?: {
    actionType?: string;
    skillName?: string;
    timeOfDay?: string;
    userContext?: string; // "busy", "relaxing", "working", etc
    reason?: string; // Razón libre si fue no_useful
  };
}

export interface FeedbackStats {
  userId: string;
  totalFeedback: number;
  useful: number;
  notUseful: number;
  usefulRate: number;
  byContext: Record<FeedbackContext, { useful: number; total: number }>;
  byActionType: Record<string, { useful: number; total: number }>;
  recentRejections: { actionType: string; timestamp: Date }[];
  preferredTimeWindows: Record<string, { morning: number; afternoon: number; evening: number }>;
}

export class FeedbackProcessor {
  constructor(private jsonStore: JSONStore) {}

  recordFeedback(feedback: UserFeedback): void {
    try {
      const data = this.jsonStore.read();

      if (!data.user_feedback) {
        data.user_feedback = [];
      }

      data.user_feedback.push({
        ...feedback,
        timestamp: feedback.timestamp.toISOString(),
      });

      this.jsonStore.write(data);
    } catch (error) {
      logger.error('Error recording feedback', { error });
    }
  }

  getFeedbackStats(userId: string): FeedbackStats {
    try {
      const data = this.jsonStore.read();
      const allFeedback = (data.user_feedback || []).filter(
        (f: any) => f.userId === userId
      );

      const stats: FeedbackStats = {
        userId,
        totalFeedback: allFeedback.length,
        useful: 0,
        notUseful: 0,
        usefulRate: 0,
        byContext: {
          'morning_routine': { useful: 0, total: 0 },
          'autonomous_action': { useful: 0, total: 0 },
          'reminder': { useful: 0, total: 0 },
          'suggestion': { useful: 0, total: 0 },
        },
        byActionType: {},
        recentRejections: [],
        preferredTimeWindows: {},
      };

      for (const feedback of allFeedback) {
        if (feedback.feedbackType === 'useful' || feedback.feedbackType === 'execute') {
          stats.useful++;
        } else if (feedback.feedbackType === 'not_useful' || feedback.feedbackType === 'cancel') {
          stats.notUseful++;
        }
        const ctx = feedback.context as FeedbackContext;
        if (ctx in stats.byContext) {
          stats.byContext[ctx].total++;
          if (feedback.feedbackType === 'useful' || feedback.feedbackType === 'execute') {
            stats.byContext[ctx].useful++;
          }
        }
        const actionType = feedback.metadata?.actionType || 'unknown';
        if (!stats.byActionType[actionType]) {
          stats.byActionType[actionType] = { useful: 0, total: 0 };
        }
        stats.byActionType[actionType].total++;
        if (feedback.feedbackType === 'useful' || feedback.feedbackType === 'execute') {
          stats.byActionType[actionType].useful++;
        }
        if (feedback.feedbackType === 'not_useful' || feedback.feedbackType === 'cancel') {
          const timestamp = new Date(feedback.timestamp);
          if (Date.now() - timestamp.getTime() < 7 * 24 * 60 * 60 * 1000) {
            // Últimos 7 días
            stats.recentRejections.push({ actionType, timestamp });
          }
        }
        const timeOfDay = feedback.metadata?.timeOfDay || 'unknown';
        if (!stats.preferredTimeWindows[actionType]) {
          stats.preferredTimeWindows[actionType] = { morning: 0, afternoon: 0, evening: 0 };
        }

        if (feedback.feedbackType === 'useful' || feedback.feedbackType === 'execute') {
          const window = this.getTimeWindow(timeOfDay);
          if (window in stats.preferredTimeWindows[actionType]) {
            stats.preferredTimeWindows[actionType][window as keyof (typeof stats.preferredTimeWindows)[string]]++;
          }
        }
      }

      if (stats.totalFeedback > 0) {
        stats.usefulRate = stats.useful / stats.totalFeedback;
      }
      stats.recentRejections = stats.recentRejections.slice(-50);

      return stats;
    } catch (error) {
      logger.error('Error getting feedback stats', { userId, error });
      return {
        userId,
        totalFeedback: 0,
        useful: 0,
        notUseful: 0,
        usefulRate: 0,
        byContext: {
          'morning_routine': { useful: 0, total: 0 },
          'autonomous_action': { useful: 0, total: 0 },
          'reminder': { useful: 0, total: 0 },
          'suggestion': { useful: 0, total: 0 },
        },
        byActionType: {},
        recentRejections: [],
        preferredTimeWindows: {},
      };
    }
  }

  shouldSuppressActionType(userId: string, actionType: string): boolean {
    const stats = this.getFeedbackStats(userId);

    // Si tiene 3+ rechazos en las últimas 24h del mismo tipo, suprimir
    const recentRejections24h = stats.recentRejections.filter((r) => {
      const hoursAgo = (Date.now() - r.timestamp.getTime()) / (1000 * 60 * 60);
      return r.actionType === actionType && hoursAgo < 24;
    });

    if (recentRejections24h.length >= 3) {
      logger.info('Action type suppressed due to recent rejections', {
        userId,
        actionType,
        rejectionCount: recentRejections24h.length,
      });
      return true;
    }
    const recentActions = stats.byActionType[actionType];
    if (
      recentActions &&
      recentActions.total >= 10 &&
      (1 - recentActions.useful / recentActions.total) > 0.7
    ) {
      logger.info('Action type suppressed due to high rejection rate', {
        userId,
        actionType,
        rejectionRate: ((1 - recentActions.useful / recentActions.total) * 100).toFixed(1) + '%',
      });
      return true;
    }

    return false;
  }

  private getTimeWindow(timeOfDay: string): 'morning' | 'afternoon' | 'evening' {
    const hour = parseInt(timeOfDay.split(':')[0] || '12');
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
  }

  getBestTimeWindow(userId: string, actionType: string): 'morning' | 'afternoon' | 'evening' {
    const stats = this.getFeedbackStats(userId);
    const windows = stats.preferredTimeWindows[actionType];

    if (!windows || (windows.morning === 0 && windows.afternoon === 0 && windows.evening === 0)) {
      return 'morning'; // Default
    }

    if (windows.morning >= windows.afternoon && windows.morning >= windows.evening) {
      return 'morning';
    } else if (windows.afternoon >= windows.evening) {
      return 'afternoon';
    } else {
      return 'evening';
    }
  }

  /**
   * Calcula confianza en una acción basada en feedback
   * Retorna 0.0-1.0
   */
  getActionConfidence(userId: string, actionType: string): number {
    const stats = this.getFeedbackStats(userId);
    const actionStats = stats.byActionType[actionType];

    if (!actionStats || actionStats.total === 0) {
      return 0.5; // Default neutral
    }

    // Fórmula: (useful / total) pero con penalidad si muy pocas acciones
    const rate = actionStats.useful / actionStats.total;
    const confidence = rate * Math.min(1, actionStats.total / 20); // Escala con más datos

    return Math.max(0, Math.min(1, confidence));
  }
}
