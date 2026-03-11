/**
 * Context Analyzer - Fase 10 PASO 5
 * 
 * Analiza el estado actual del usuario para tomar decisiones
 * de interrupción más inteligentes:
 * 
 * - Detecta si el usuario está escribiendo activamente
 * - Identifica horarios de reuniones/picos de actividad
 * - Categoriza el estado contextual (focused, busy, available, sleep)
 * - Proporciona información para decisiones de interruption
 */

import { logger } from '../utils/logger.js';
import { ConversationStore } from '../storage/conversation.store.js';
import { ConversationMessage } from '../config/types.js';
import { PatternDetector } from './pattern-detector.js';
import { InterruptionPolicyStore } from './interruption-policy.store.js';
import { UserContextStore } from './user-context.store.js';

export type ContextState = 'focused' | 'busy' | 'available' | 'sleep';

export interface UserContext {
  state: ContextState;
  isTyping: boolean;                    // Escribiendo activamente (últimos 15 min)
  messageFrequency: number;             // Mensajes por minuto en los últimos 15 min
  lastMessageTime: Date | null;         // Último mensaje del usuario
  timeSinceLastMessage: number;         // Minutos desde el último mensaje
  isInQuietHours: boolean;              // Dentro de quiet hours?
  isInMeetingTime: boolean;             // Pico de actividad típico?
  isDoNotDisturb: boolean;              // DND desactivado?
  confidenceScore: number;              // 0-100: cuán seguro estamos del análisis
  suggestions: string[];                // Sugerencias de cuándo interrumpir
}

export class ContextAnalyzer {
  // Configuración de umbrales
  private readonly TYPING_THRESHOLD = 0.5;              // 1+ mensajes cada 2 minutos = typing
  private readonly MESSAGES_WINDOW = 15 * 60 * 1000;    // 15 minutos
  private readonly FOCUSED_COOLDOWN = 5 * 60 * 1000;    // 5 minutos después del último mensaje
  private readonly TYPING_ACTIVITY_WINDOW = 30 * 60 * 1000; // Ventana de 30 min para analizar

  constructor(
    private conversationStore: ConversationStore,
    private patternDetector: PatternDetector,
    private policyStore: InterruptionPolicyStore,
    private userContextStore: UserContextStore
  ) {}

  /**
   * Analiza el contexto completo del usuario
   * Retorna información para decisiones inteligentes de interruption
   */
  async analyzeUserContext(userId: string): Promise<UserContext> {
    try {
      const now = new Date();

      // 1. Analizar typing activity (últimos 30 minutos)
      const typingAnalysis = await this.analyzeTypingActivity(userId);

      // 1.5. PASO 5: Incorporar UserContextStore para precisión aumentada
      const userContext = this.userContextStore.getContext(userId);
      const userIsBusyByContext = userContext ? this.userContextStore.isUserBusy(userId) : false;

      // 2. Analizar quiet hours
      const policy = await this.policyStore.getPolicy(userId);
      const inQuietHours = this.isInQuietHours(now, policy.quietHours.start, policy.quietHours.end);

      // 3. Analizar patrones de actividad (meeting time detection)
      const pattern = await this.patternDetector.detectCurrentPattern(userId);
      const isInMeetingTime = pattern !== null && pattern.confidence > 0.7;

      // 4. Combinar información para estado contextual
      // PASO 5: Usar UserContextStore.isUserBusy como entrada
      const state = this.determineContextState(
        {
          ...typingAnalysis,
          isUserBusyByContext: userIsBusyByContext  // Información adicional
        },
        inQuietHours,
        isInMeetingTime,
        policy.doNotDisturb
      );

      // 5. Calcular confidence score
      const confidenceScore = this.calculateConfidence(
        typingAnalysis.messageFrequency,
        pattern?.confidence || 0,
        typingAnalysis.timeSinceLastMessage
      );

      // 6. Generar sugerencias
      const suggestions = this.generateSuggestions(
        state,
        typingAnalysis,
        inQuietHours,
        isInMeetingTime,
        policy
      );

      const context: UserContext = {
        state,
        isTyping: typingAnalysis.isTyping || userIsBusyByContext,  // OR ambas fuentes
        messageFrequency: typingAnalysis.messageFrequency,
        lastMessageTime: typingAnalysis.lastMessageTime,
        timeSinceLastMessage: typingAnalysis.timeSinceLastMessage,
        isInQuietHours: inQuietHours,
        isInMeetingTime,
        isDoNotDisturb: policy.doNotDisturb,
        confidenceScore,
        suggestions,
      };

      logger.debug('User context analyzed', {
        userId,
        state: context.state,
        isTyping: context.isTyping,
        userContextBusy: userIsBusyByContext,
        confidence: context.confidenceScore,
      });

      return context;
    } catch (error) {
      logger.error('Failed to analyze user context', { userId, error });

      // En caso de error, asumir "available" (más seguro interrumpir)
      return {
        state: 'available',
        isTyping: false,
        messageFrequency: 0,
        lastMessageTime: null,
        timeSinceLastMessage: Infinity,
        isInQuietHours: false,
        isInMeetingTime: false,
        isDoNotDisturb: false,
        confidenceScore: 0,
        suggestions: ['Unable to analyze context, proceeding with caution'],
      };
    }
  }

  /**
   * Analiza si el usuario está escribiendo activamente
   * Basado en frecuencia de mensajes recientes
   */
  private async analyzeTypingActivity(
    userId: string
  ): Promise<{
    isTyping: boolean;
    messageFrequency: number;
    lastMessageTime: Date | null;
    timeSinceLastMessage: number;
    messageCount: number;
  }> {
    try {
      // Obtener conversaciones recientes (últimos 30 minutos)
      const conversations = this.conversationStore.getHistory(userId, 100);

      if (!conversations || conversations.length === 0) {
        return {
          isTyping: false,
          messageFrequency: 0,
          lastMessageTime: null,
          timeSinceLastMessage: Infinity,
          messageCount: 0,
        };
      }

      const now = Date.now();
      const windowStart = now - this.TYPING_ACTIVITY_WINDOW;

      // Filtrar mensajes dentro de la ventana (últimos 30 minutos)
      const recentMessages: ConversationMessage[] = conversations.filter((conv) => {
        const msgTime = new Date(conv.timestamp).getTime();
        return msgTime >= windowStart;
      });

      if (recentMessages.length === 0) {
        return {
          isTyping: false,
          messageFrequency: 0,
          lastMessageTime: null,
          timeSinceLastMessage: Infinity,
          messageCount: 0,
        };
      }

      // Calcular frecuencia (mensajes por minuto)
      const windowMinutes = this.TYPING_ACTIVITY_WINDOW / (60 * 1000);
      const messageFrequency = recentMessages.length / windowMinutes;

      // Obtener último mensaje
      const lastMessage = recentMessages[recentMessages.length - 1];
      const lastMessageTime = new Date(lastMessage.timestamp);
      const timeSinceLastMessage = (now - lastMessageTime.getTime()) / (60 * 1000);

      // Determinar si está escribiendo
      // Criterios:
      // 1. Frecuencia > threshold (mucho activity reciente)
      // 2. O último mensaje dentro de 5 minutos + hay varios mensajes
      const isTyping =
        messageFrequency >= this.TYPING_THRESHOLD ||
        (timeSinceLastMessage <= 5 && recentMessages.length >= 2);

      logger.debug('Typing activity analyzed', {
        userId,
        messageCount: recentMessages.length,
        messageFrequency: messageFrequency.toFixed(2),
        timeSinceLastMessage: timeSinceLastMessage.toFixed(1),
        isTyping,
      });

      return {
        isTyping,
        messageFrequency,
        lastMessageTime,
        timeSinceLastMessage,
        messageCount: recentMessages.length,
      };
    } catch (error) {
      logger.error('Failed to analyze typing activity', { userId, error });
      return {
        isTyping: false,
        messageFrequency: 0,
        lastMessageTime: null,
        timeSinceLastMessage: Infinity,
        messageCount: 0,
      };
    }
  }

  /**
   * Determina el estado contextual basado en múltiples factores
   */
  private determineContextState(
    typingAnalysisWithContext: Awaited<ReturnType<typeof this.analyzeTypingActivity>> & {
      isUserBusyByContext?: boolean;
    },
    inQuietHours: boolean,
    isInMeetingTime: boolean,
    isDoNotDisturb: boolean
  ): ContextState {
    // Prioridad 1: Quiet hours o DND
    if (inQuietHours || isDoNotDisturb) {
      return 'sleep';
    }

    // Prioridad 2: Escribiendo activamente (por timing de mensajes O por UserContextStore)
    if (typingAnalysisWithContext.isTyping || typingAnalysisWithContext.isUserBusyByContext) {
      return 'focused';
    }

    // Prioridad 3: En pico de actividad típico (meeting time)
    if (isInMeetingTime && typingAnalysisWithContext.timeSinceLastMessage < 10) {
      return 'busy';
    }

    // Prioridad 4: Espacio después de escribir (still focused)
    if (typingAnalysisWithContext.timeSinceLastMessage < 5) {
      return 'focused';
    }

    // Default: available
    return 'available';
  }

  /**
   * Calcula un score de confianza (0-100)
   * Basado en criterios de análisis
   */
  private calculateConfidence(
    messageFrequency: number,
    patternConfidence: number,
    timeSinceLastMessage: number
  ): number {
    let score = 50; // Base 50%

    // Mensajes recientes mejoran confianza
    if (messageFrequency > 0) {
      score += Math.min(30, messageFrequency * 10);
    }

    // Patrones detectados mejoran confianza
    if (patternConfidence > 0) {
      score += patternConfidence * 20;
    }

    // Mensajes muy antiguos disminuyen confianza
    if (timeSinceLastMessage > 60) {
      score -= 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Genera sugerencias para cuándo/cómo interrumpir
   */
  private generateSuggestions(
    state: ContextState,
    typingAnalysis: Awaited<ReturnType<typeof this.analyzeTypingActivity>>,
    inQuietHours: boolean,
    isInMeetingTime: boolean,
    policy: any
  ): string[] {
    const suggestions: string[] = [];

    switch (state) {
      case 'sleep':
        suggestions.push('User is in quiet hours or DND mode');
        if (policy.allowUrgent) {
          suggestions.push('Only urgent notifications should interrupt');
        }
        break;

      case 'focused':
        suggestions.push('User is actively working - avoid interruption');
        suggestions.push('Queue notification for later (next 10-15 minutes)');
        if (typingAnalysis.messageFrequency > 1) {
          suggestions.push('Very active right now - consider waiting for a pause');
        }
        break;

      case 'busy':
        suggestions.push('User appears to be in a meeting or high-activity period');
        suggestions.push('Batch similar notifications');
        suggestions.push('Queue for after typical meeting time');
        break;

      case 'available':
        suggestions.push('Safe to interrupt now');
        if (typingAnalysis.timeSinceLastMessage > 30) {
          suggestions.push('User has been inactive for some time');
          suggestions.push('They may be AFK');
        } else {
          suggestions.push('Recent activity detected - notification likely to be seen');
        }
        break;
    }

    return suggestions;
  }

  /**
   * Helper: verifica si una hora está en quiet hours
   * Maneja casos especiales como ranges que cruzan medianoche (22:00 - 06:00)
   */
  private isInQuietHours(now: Date, start: string, end: string): boolean {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Range que cruza medianoche
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }

  /**
   * Determina si debería interrumpir AHORA basándose en contexto
   * Usado por AutonomousEngine y MonitoringSystem
   */
  async shouldInterruptNow(
    userId: string,
    eventSeverity: 'normal' | 'important' | 'urgent',
    eventType?: string
  ): Promise<{
    allowed: boolean;
    reason: string;
    shouldQueue: boolean;
    queueDelay?: number; // ms
  }> {
    try {
      const context = await this.analyzeUserContext(userId);

      // Matriz de decisión
      const decision = this.makeInterruptionDecision(context, eventSeverity, eventType);

      return decision;
    } catch (error) {
      logger.error('Error determining interruption', { userId, error });
      // En error, más conservador: no interrumpir
      return {
        allowed: false,
        reason: 'Unable to analyze context',
        shouldQueue: true,
        queueDelay: 5 * 60 * 1000, // Reintentar en 5 min
      };
    }
  }

  /**
   * Matriz de decisiones contextuales
   */
  private makeInterruptionDecision(
    context: UserContext,
    severity: 'normal' | 'important' | 'urgent',
    eventType?: string
  ): {
    allowed: boolean;
    reason: string;
    shouldQueue: boolean;
    queueDelay?: number;
  } {
    // Estado 'sleep' es el más restrictivo
    if (context.state === 'sleep') {
      if (severity === 'urgent') {
        return {
          allowed: true,
          reason: 'Urgent event overrides quiet hours/DND',
          shouldQueue: false,
        };
      }
      return {
        allowed: false,
        reason: `${context.state} state - queue for later`,
        shouldQueue: true,
        queueDelay: 30 * 60 * 1000, // Reintentar en 30 min
      };
    }

    // Estado 'focused' - muy restrictivo
    if (context.state === 'focused') {
      if (severity === 'urgent') {
        return {
          allowed: true,
          reason: 'Urgent event interrupts even when focused',
          shouldQueue: false,
        };
      }
      if (severity === 'important') {
        return {
          allowed: false,
          reason: 'User is focused - queue important notification',
          shouldQueue: true,
          queueDelay: 10 * 60 * 1000, // Reintentar en 10 min
        };
      }
      // Normal: solo queue
      return {
        allowed: false,
        reason: 'User is focused - queue normal notification',
        shouldQueue: true,
        queueDelay: 15 * 60 * 1000, // Reintentar en 15 min
      };
    }

    // Estado 'busy' - moderadamente restrictivo
    if (context.state === 'busy') {
      if (severity === 'urgent' || severity === 'important') {
        return {
          allowed: true,
          reason: 'Urgent/important event - interrupt despite being busy',
          shouldQueue: false,
        };
      }
      // Normal: queue
      return {
        allowed: false,
        reason: 'User is busy - queue normal notification',
        shouldQueue: true,
        queueDelay: 20 * 60 * 1000, // Reintentar en 20 min
      };
    }

    // Estado 'available' - permisivo
    if (context.state === 'available') {
      // Casi siempre interrumpir
      if (severity === 'urgent' || severity === 'important') {
        return {
          allowed: true,
          reason: 'User available and event is important/urgent',
          shouldQueue: false,
        };
      }

      // Para normal: todavía interrumpir, pero menos agresivamente
      return {
        allowed: true,
        reason: 'User available - proceed with notification',
        shouldQueue: false,
      };
    }

    // Default (should not reach)
    return {
      allowed: true,
      reason: 'Unknown state - defaulting to allow',
      shouldQueue: false,
    };
  }
}
