/**
 * Autonomous Engine - Fase 10
 * 
 * Motor de iniciativa propia: genera acciones autónomas basadas en:
 * - Prospective memories vencidas
 * - Patrones detectados
 * - Eventos de skills (genérico, no hardcoded)
 * 
 * ARQUITECTURA GENÉRICA:
 * - No hardcodea GitHub, Home Assistant, etc.
 * - Itera sobre skills disponibles y sus autonomousTriggers
 * - Cada skill define qué eventos monitorea
 * - Sistema decide SI actuar basándose en interruption policies
 */

import { logger } from '../utils/logger.js';
import { SkillStore } from '../storage/skill.store.js';
import { ProspectiveMemoryStore } from '../storage/prospective-memory.store.js';
import { InterruptionPolicyStore } from './interruption-policy.store.js';
import { AutonomousEventStore } from './event.store.js';
import { PatternDetector } from './pattern-detector.js';
import { SkillEventMonitor } from './skill-event-monitor.js';
import { ContextAnalyzer } from './context-analyzer.js';
import { UserContextStore } from './user-context.store.js';
import { ExternalEvent } from './external-event-monitor.js';
import { ActionCoordinator } from './action-coordinator.js';
import { RoutineScheduler } from './routine-scheduler.js';
import { RoutineGenerator } from './routine-generator.js';
import { RoutineStore } from '../storage/routine.store.js';
import { EmergencyInterruptHandler } from './emergency-interrupt.js';
import { FeedbackProcessor } from './feedback-processor.js';
import { OpportunityDetector } from './opportunity-detector.js';

export interface AutonomousAction {
  id: string;
  userId: string;
  type: 'notification' | 'reminder' | 'suggestion' | 'alert';
  skillName: string;
  triggerType: string;
  message: string;
  timestamp: Date;
  executed: boolean;
  executedAt?: Date;
}

export interface AutonomousContext {
  userId: string;
  currentTime: Date;
  skillName: string;
  triggerType: string;
  data?: Record<string, any>;
}

export class AutonomousEngine {
  private loopInterval: NodeJS.Timeout | null = null;
  private activeLoops: Map<string, NodeJS.Timeout> = new Map();
  private lastPatternAnalysis: Map<string, Date> = new Map(); // Track pattern analysis timestamps
  private readonly PATTERN_ANALYSIS_INTERVAL = 24 * 60 * 60 * 1000; // 24 horas

  constructor(
    private skillStore: SkillStore,
    private prospectiveMemoryStore: ProspectiveMemoryStore,
    private interruptionPolicyStore: InterruptionPolicyStore,
    private eventStore: AutonomousEventStore,
    private patternDetector: PatternDetector,
    private skillEventMonitor: SkillEventMonitor,
    private contextAnalyzer: ContextAnalyzer,
    private userContextStore: UserContextStore,
    private actionCoordinator: ActionCoordinator,
    private telegramSender: (userId: string, message: string) => Promise<void>,
    private routineScheduler: RoutineScheduler,
    private routineGenerator: RoutineGenerator,
    private routineStore: RoutineStore,
    private emergencyHandler: EmergencyInterruptHandler,
    private feedbackProcessor: FeedbackProcessor,
    private opportunityDetector: OpportunityDetector
  ) {}

  /**
   * Iniciar bucle autónomo para un usuario
   * Cada 5 minutos evalúa la situación y decide si actuar
   */
  async startAutonomousLoop(userId: string): Promise<void> {
    logger.info('Starting autonomous loop', { userId });

    // Limpiar loop anterior si existe
    if (this.activeLoops.has(userId)) {
      clearInterval(this.activeLoops.get(userId)!);
    }

    // Ejecutar evaluación inicial
    await this.evaluateSituation(userId);

    // Bucle cada 5 minutos
    const interval = setInterval(() => {
      this.evaluateSituation(userId).catch((error) => {
        logger.error('Error in autonomous loop evaluation', { userId, error });
      });
    }, 5 * 60 * 1000); // 5 minutos

    this.activeLoops.set(userId, interval);
  }

  /**
   * Detener bucle autónomo para un usuario
   */
  async stopAutonomousLoop(userId: string): Promise<void> {
    if (this.activeLoops.has(userId)) {
      clearInterval(this.activeLoops.get(userId)!);
      this.activeLoops.delete(userId);
      logger.info('Stopped autonomous loop', { userId });
    }
  }

  /**
   * Registra interacción del usuario para interruption intelligence
   * Permite que el sistema sepa cuándo fue la última interacción
   * y pueda tomar decisiones sobre si es buen momento de interrumpir
   */
  recordInteraction(userId: string, type: 'message' | 'command' | 'voice' = 'message'): void {
    this.userContextStore.recordInteraction(userId, type);
    logger.debug('User interaction recorded', { userId, type });
  }

  /**
   * Evalúa la situación actual y decide si actuar
   * ARQUITECTURA GENÉRICA: itera skills disponibles
   */
  private async evaluateSituation(userId: string): Promise<void> {
    const startTime = Date.now();
    const currentTime = new Date();

    try {
      // 1. Revisar prospective memories vencidas
      const overdueMemories = await this.prospectiveMemoryStore.getOverdue(userId);

      // 2. Revisar tareas próximas (próximas 24 horas)
      const upcomingMemories = await this.prospectiveMemoryStore.getUpcoming(userId, 1);

      // 3. Detectar patrones actuales
      const currentPattern = await this.patternDetector.detectCurrentPattern(userId);

      // 4. Revisar skills con autonomousTriggers
      const allSkills = await this.skillStore.listAvailableSkills();
      const triggeredSkills = allSkills.filter(
        (skill) => skill.autonomousTriggers && skill.autonomousTriggers.length > 0
      );

      logger.debug('Autonomous evaluation', {
        userId,
        overdueMemoriesCount: overdueMemories.length,
        upcomingMemoriesCount: upcomingMemories.length,
        patternDetected: currentPattern ? currentPattern.patternType : 'none',
        skillsWithTriggersCount: triggeredSkills.length,
      });

      // 5. Para cada skill con triggers, monitorear eventos
      for (const skill of triggeredSkills) {
        for (const triggerType of skill.autonomousTriggers!) {
          await this.handleSkillTrigger(userId, skill.name, triggerType, currentTime);
        }
      }

      // 6. NUEVO: Ejecutar monitores externos de skills
      await this.monitorExternalEvents(userId, currentTime);

      // 7. Procesar prospective memories vencidas
      for (const memory of overdueMemories) {
        await this.handleOverdueMemory(userId, memory, currentTime);
      }

      // 8. Procesar tareas próximas (avisar 30 min antes)
      for (const memory of upcomingMemories) {
        await this.handleUpcomingMemory(userId, memory, currentTime);
      }

      // 9. Procesar patrón detectado
      if (currentPattern) {
        await this.handlePatternMatch(userId, currentPattern, currentTime);
      }

      // 10. NUEVO PASO 6: Ejecutar acciones autónomas después de evaluar situación
      // Esto permite que se ejecuten acciones basadas en las memories y eventos procesados
      await this.actionCoordinator.executeEligibleActions(
        userId,
        'memory_overdue',  // Trigger general - después de evaluar memories vencidas
        {
          overtime: {
            overdueCount: overdueMemories.length,
            upcomingCount: upcomingMemories.length,
          },
        }
      );

      // 11. PASO 7: Ejecutar rutinas (morning, evening, daily summary, weekly planning)
      await this.executeRoutines(userId);

      // 12. PASO 8: Evaluar emergencias críticas
      await this.evaluateEmergencies(userId);

      // 13. PASO 10: Detectar oportunidades proactivas
      await this.detectAndSuggestOpportunities(userId);

      // 14. Ejecutar análisis de patrones periódicamente (cada 24h)
      await this.maybeRefreshPatterns(userId);

      const duration = Date.now() - startTime;
      logger.debug('Autonomous evaluation completed', { userId, durationMs: duration });
    } catch (error) {
      logger.error('Error evaluating autonomous situation', { userId, error });
    }
  }

  /**
   * Maneja un trigger específico de un skill
   * Genérico: el skill define qué es un trigger
   */
  private async handleSkillTrigger(
    userId: string,
    skillName: string,
    triggerType: string,
    currentTime: Date
  ): Promise<void> {
    const context: AutonomousContext = {
      userId,
      currentTime,
      skillName,
      triggerType,
    };

    try {
      // TODO: En futuras fases, cada skill tendrá un manejador de eventos
      // Por ahora, es un placeholder para la arquitectura genérica
      logger.debug('Skill trigger evaluated', { userId, skillName, triggerType });
    } catch (error) {
      logger.warn('Error handling skill trigger', { userId, skillName, triggerType, error });
    }
  }

  /**
   * Maneja una memoria prospectiva vencida
   * Envía recordatorio si pasa las interruption policies
   * PASO 5: Usa ContextAnalyzer para decisiones inteligentes
   */
  private async handleOverdueMemory(userId: string, memory: any, currentTime: Date): Promise<void> {
    try {
      // PASO 5: Usar ContextAnalyzer para decisión contextual
      const decision = await this.contextAnalyzer.shouldInterruptNow(
        userId,
        'important',  // Recordatorios son importantes
        'overdue_reminder'
      );

      if (!decision.allowed) {
        logger.debug('Queuing overdue memory reminder - user context', {
          userId,
          memoryId: memory.id,
          reason: decision.reason,
        });
        // TODO PASO 6: Implementar queueing si decision.shouldQueue
        return;
      }

      // Generar mensaje
      const message = this.generateMemoryReminderMessage(memory);

      // Grabar acción autónoma
      await this.eventStore.recordAction(userId, {
        id: `autonomous-${Date.now()}`,
        userId,
        type: 'reminder',
        skillName: 'system',
        triggerType: 'overdue_memory',
        message,
        timestamp: currentTime,
        executed: false,
      });

      // Enviar notificación
      await this.telegramSender(userId, message);

      // Marcar como ejecutada
      await this.eventStore.markActionExecuted(`autonomous-${Date.now()}`);

      logger.info('Sent memory reminder', { userId, memoryId: memory.id });
    } catch (error) {
      logger.error('Error handling overdue memory', { userId, memoryId: memory.id, error });
    }
  }

  /**
   * Genera mensaje de recordatorio para una memoria vencida
   */
  private generateMemoryReminderMessage(memory: any): string {
    const overdueDays = Math.floor(
      (Date.now() - memory.dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    return (
      `⏰ **Recordatorio de Tarea Vencida**\n\n` +
      `${memory.content}\n\n` +
      `_Vencida hace ${overdueDays} día(s)_\n\n` +
      `¿Lo revisamos ahora o lo movemos para mañana?`
    );
  }

  /**
   * Maneja una memoria próxima a vencer (aviso 30 minutos antes)
   * Evita duplicados usando lastMentioned para tracking
   */
  private async handleUpcomingMemory(userId: string, memory: any, currentTime: Date): Promise<void> {
    try {
      // Verificar si ya fue notificado hace poco (dentro de 30 minutos)
      const lastMentioned = memory.lastMentioned ? new Date(memory.lastMentioned) : null;
      if (lastMentioned && currentTime.getTime() - lastMentioned.getTime() < 30 * 60 * 1000) {
        // Ya fue notificado hace menos de 30 minutos, skip
        logger.debug('Skipping upcoming memory - already notified recently', {
          userId,
          memoryId: memory.id,
        });
        return;
      }

      // Calcular minutos hasta vencimiento
      const dueDate = new Date(memory.dueDate);
      const minutesUntilDue = Math.floor((dueDate.getTime() - currentTime.getTime()) / (1000 * 60));

      // Solo notificar si está en los próximos 30 minutos
      if (minutesUntilDue > 30 || minutesUntilDue < 0) {
        return;
      }

      // PASO 5: Usar ContextAnalyzer para decisión contextual
      const decision = await this.contextAnalyzer.shouldInterruptNow(
        userId,
        'important',  // Recordatorios próximos son importantes
        'upcoming_reminder'
      );

      if (!decision.allowed) {
        logger.debug('Queuing upcoming memory reminder - user context', {
          userId,
          memoryId: memory.id,
          reason: decision.reason,
        });
        // TODO PASO 6: Implementar queueing si decision.shouldQueue
        return;
      }

      // Generar mensaje
      const message = this.generateUpcomingMemoryMessage(memory, minutesUntilDue);

      // Grabar acción autónoma
      await this.eventStore.recordAction(userId, {
        id: `upcoming-${memory.id}-${Date.now()}`,
        userId,
        type: 'reminder',
        skillName: 'system',
        triggerType: 'upcoming_memory',
        message,
        timestamp: currentTime,
        executed: false,
      });

      // Enviar notificación
      await this.telegramSender(userId, message);

      // Actualizar lastMentioned para tracking
      this.prospectiveMemoryStore.updateProspective(userId, memory.id, {
        lastMentioned: currentTime,
        mentionCount: (memory.mentionCount || 0) + 1,
      });

      // Marcar como ejecutada
      await this.eventStore.markActionExecuted(`upcoming-${memory.id}-${Date.now()}`);

      logger.info('Sent upcoming memory reminder', {
        userId,
        memoryId: memory.id,
        minutesUntilDue,
      });
    } catch (error) {
      logger.error('Error handling upcoming memory', {
        userId,
        memoryId: memory.id,
        error,
      });
    }
  }

  /**
   * Genera mensaje amigable para una tarea próxima a vencer
   */
  private generateUpcomingMemoryMessage(memory: any, minutesUntilDue: number): string {
    let urgencyEmoji = '⏰';
    let urgencyText = 'próximamente';

    if (minutesUntilDue <= 10) {
      urgencyEmoji = '🔴';
      urgencyText = 'en pocos minutos';
    } else if (minutesUntilDue <= 20) {
      urgencyEmoji = '🟡';
      urgencyText = `en ${minutesUntilDue} minutos`;
    }

    return (
      `${urgencyEmoji} **Recordatorio Próximo**\n\n` +
      `${memory.content}\n\n` +
      `_Vence ${urgencyText}_\n\n` +
      `¿Necesitas ayuda para prepararte?`
    );
  }

  /**
   * Maneja un patrón detectado en la conducta del usuario
   * Envía sugerencia proactiva si pasa las políticas
   * PASO 5: Usa ContextAnalyzer para decisiones inteligentes
   */
  private async handlePatternMatch(userId: string, pattern: any, currentTime: Date): Promise<void> {
    try {
      // PASO 5: Usar ContextAnalyzer para decisión contextual
      const decision = await this.contextAnalyzer.shouldInterruptNow(
        userId,
        'normal',  // Los patrones son notificaciones normales
        'pattern_suggestion'
      );

      if (!decision.allowed) {
        logger.debug('Queuing pattern suggestion - user context', {
          userId,
          reason: decision.reason,
        });
        // TODO PASO 6: Implementar queueing si decision.shouldQueue
        return;
      }

      // Generar mensaje basado en el patrón
      const message = this.generatePatternMessage(pattern);

      // Grabar acción autónoma
      await this.eventStore.recordAction(userId, {
        id: `pattern-${Date.now()}`,
        userId,
        type: 'suggestion',
        skillName: 'pattern-detection',
        triggerType: pattern.patternType,
        message,
        timestamp: currentTime,
        executed: false,
      });

      // Enviar notificación
      await this.telegramSender(userId, message);

      // Marcar como ejecutada
      await this.eventStore.markActionExecuted(`pattern-${Date.now()}`);

      logger.info('Sent pattern-based suggestion', { userId, pattern: pattern.patternType });
    } catch (error) {
      logger.error('Error handling pattern match', { userId, error });
    }
  }

  /**
   * Genera mensaje amigable basado en un patrón detectado
   */
  private generatePatternMessage(pattern: any): string {
    const messages: Record<string, string> = {
      morning_routine: '🌅 Buenos días! Es hora de tu rutina matutina. ¿Preparamos el café? ☕',
      work_start: '💼 Es hora de empezar a trabajar. ¿Revisamos lo pendiente?',
      break_time: '⏸️ Es hora de descansar. ¿Tomamos un break?',
      evening_check: '🌙 Buenas noches. ¿Hacemos un check del día?',
      custom: `📊 Detecté un patrón en tu conducta: ${pattern.description}`
    };

    return messages[pattern.patternType] || messages.custom;
  }

  /**
   * Ejecuta análisis de patrones si ha pasado suficiente tiempo
   * Solo analiza cada 24h para no sobrecargar el sistema
   */
  private async maybeRefreshPatterns(userId: string): Promise<void> {
    try {
      const lastAnalysis = this.lastPatternAnalysis.get(userId);
      const now = Date.now();

      // Si no hay análisis anterior o ha pasado 24h, ejecutar análisis
      if (!lastAnalysis || now - lastAnalysis.getTime() >= this.PATTERN_ANALYSIS_INTERVAL) {
        logger.debug('Refreshing user patterns', { userId });

        const newPatterns = await this.patternDetector.refreshPatterns(userId);

        if (newPatterns.length > 0) {
          logger.info('New patterns detected', {
            userId,
            patternsFound: newPatterns.length,
            types: newPatterns.map(p => p.patternType)
          });
        }

        this.lastPatternAnalysis.set(userId, new Date());
      }
    } catch (error) {
      logger.error('Error refreshing patterns', { userId, error });
    }
  }

  /**
   * Monitorea eventos externos de skills
   * Ejecuta todos los monitores registrados y procesa eventos
   */
  private async monitorExternalEvents(userId: string, currentTime: Date): Promise<void> {
    try {
      // Ejecutar todos los monitores
      const externalEvents = await this.skillEventMonitor.checkAllMonitors();

      if (externalEvents.length === 0) {
        logger.debug('No external events detected', { userId });
        return;
      }

      logger.debug('External events detected', {
        userId,
        eventCount: externalEvents.length
      });

      // Procesar eventos por severidad
      // Filtrar solo eventos notificables
      const notifiableEvents = externalEvents.filter(e => e.shouldNotify);

      for (const event of notifiableEvents) {
        // Chequear si puede interrumpir basado en severidad y políticas
        const urgency =
          event.severity === 'urgent'
            ? 'urgent'
            : event.severity === 'high'
              ? 'important'
              : 'normal';

        // PASO 5: Usar ContextAnalyzer para decisión contextual
        const decision = await this.contextAnalyzer.shouldInterruptNow(
          userId,
          urgency,
          event.eventType
        );

        if (!decision.allowed) {
          logger.debug('Queuing external event notification - user context', {
            userId,
            eventType: event.eventType,
            skillName: event.skillName,
            reason: decision.reason,
          });
          // TODO PASO 6: Implementar queueing si decision.shouldQueue
          continue;
        }

        // Generar mensaje
        const message = this.generateExternalEventMessage(event);

        // Registrar acción autónoma
        await this.eventStore.recordAction(userId, {
          id: `external-${event.id}`,
          userId,
          type: event.severity === 'urgent' ? 'alert' : 'notification',
          skillName: event.skillName,
          triggerType: event.eventType,
          message,
          timestamp: currentTime,
          executed: false
        });

        // Enviar notificación
        await this.telegramSender(userId, message);

        // Marcar como ejecutada
        await this.eventStore.markActionExecuted(`external-${event.id}`);

        logger.info('Sent external event notification', {
          userId,
          eventType: event.eventType,
          skillName: event.skillName,
          severity: event.severity
        });
      }
    } catch (error) {
      logger.error('Error monitoring external events', { userId, error });
    }
  }

  /**
   * Genera mensaje amigable para un evento externo
   */
  private generateExternalEventMessage(event: ExternalEvent): string {
    const severityEmoji: Record<typeof event.severity, string> = {
      urgent: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '⚪'
    };

    const emoji = severityEmoji[event.severity] || '📢';

    return (
      `${emoji} **${event.title}**\n\n` +
      `${event.description}\n\n` +
      `_De: ${event.skillName} (${event.eventType})_`
    );
  }

  /**
   * PASO 7: Ejecuta rutinas matutinas/vespertinas basadas en patrones
   * - Morning routine (greeting, overdue tasks, upcoming events)
   * - Evening routine (check-in, daily summary)
   * - Weekly planning (Friday suggestions)
   */
  private async executeRoutines(userId: string): Promise<void> {
    try {
      // Obtener configuración de rutinas del usuario
      const config = this.routineStore.getRoutineConfig(userId);
      if (!config) {
        // Usuario sin configuración de rutinas aún
        return;
      }

      // Obtener rutinas programadas para hoy
      const todayRoutines = this.routineScheduler.getTodayRoutines(userId, config);

      for (const routine of todayRoutines) {
        // Verificar si es hora de ejecutar esta rutina
        const shouldExecute = this.routineScheduler.isInTimeWindow(
          routine.predictedTime || routine.scheduledFor,
          routine.routineType === 'morning' ? 3 : 2
        );

        if (!shouldExecute || routine.executed) {
          continue;
        }

        logger.debug('Executing routine', { userId, routineType: routine.routineType });

        try {
          // Generar contenido de la rutina
          const content = this.routineGenerator.generateRoutineContent(routine, config);

          // Grabar ejecución
          routine.executed = true;
          routine.executedAt = new Date();
          await this.routineStore.recordRoutine(routine);

          // Enviar notificación
          const message =
            `${content.title}\n\n${content.message}` +
            (content.items && content.items.length > 0
              ? `\n\n${content.items.map((item: string) => `• ${item}`).join('\n')}`
              : '');

          await this.telegramSender(userId, message);

          logger.info('Routine executed', {
            userId,
            routineType: routine.routineType,
          });
        } catch (error) {
          logger.error('Error executing routine', {
            userId,
            routineType: routine.routineType,
            error,
          });
        }
      }
    } catch (error) {
      logger.error('Error processing routines', { userId, error });
    }
  }

  /**
   * Verifica si hay respuesta de usuario a una acción autónoma
   * (para aprendizaje de preferencias en Fase 10+)
   */
  async recordUserFeedback(
    userId: string,
    actionId: string,
    feedback: 'useful' | 'not_useful' | 'execute' | 'cancel'
  ): Promise<void> {
    await this.eventStore.recordFeedback(userId, actionId, feedback);
    // PASO 9: Registrar feedback en FeedbackProcessor para aprendizaje
    this.feedbackProcessor.recordFeedback({
      userId,
      actionId,
      feedbackType: feedback,
      context: 'autonomous_action',
      timestamp: new Date(),
    });
    logger.debug('Recorded user feedback for autonomous action', { userId, actionId, feedback });
  }

  /**
   * PASO 8: Evalúa emergencias críticas
   * Pueden interrumpir incluso en modo "no molestar"
   */
  private async evaluateEmergencies(userId: string): Promise<void> {
    try {
      // En una versión de producción, esto recibiría eventos de:
      // - Errores críticos de skills
      // - Deadlines que comenzaron AHORA
      // - Alertas de seguridad
      // Por ahora es un placeholder para la arquitectura
      logger.debug('Evaluating emergency events', { userId });
    } catch (error) {
      logger.error('Error evaluating emergencies', { userId, error });
    }
  }

  /**
   * PASO 10: Detecta y sugiere oportunidades proactivas
   * "Deberías revisar GitHub - desayunaste hace 30min + 3 PRs pendientes"
   */
  private async detectAndSuggestOpportunities(userId: string): Promise<void> {
    try {
      const opportunities = await this.opportunityDetector.detectOpportunities(userId);

      if (opportunities.length === 0) {
        return;
      }

      // Tomar la top oportunidad (más confianza)
      const topOpportunity = opportunities[0];

      // Verificar si debería suprimir este tipo de acción (PASO 9 feedback)
      if (this.feedbackProcessor.shouldSuppressActionType(userId, topOpportunity.skillName)) {
        logger.debug('Opportunity suppressed due to user feedback', {
          userId,
          skillName: topOpportunity.skillName,
        });
        return;
      }

      // Usar ContextAnalyzer para decidir si interrumpir
      const decision = await this.contextAnalyzer.shouldInterruptNow(
        userId,
        'normal',
        `opportunity_${topOpportunity.skillName}`
      );

      if (!decision.allowed) {
        logger.debug('Opportunity queued - user context not suitable', {
          userId,
          skillName: topOpportunity.skillName,
          reason: decision.reason,
        });
        return;
      }

      // Generar y enviar sugerencia de oportunidad
      const message =
        `💡 **${topOpportunity.title}**\n\n` +
        `${topOpportunity.description}\n\n` +
        `_Confianza: ${(topOpportunity.confidence * 100).toFixed(0)}%_`;

      await this.telegramSender(userId, message);

      logger.info('Opportunity suggested', {
        userId,
        skillName: topOpportunity.skillName,
        confidence: topOpportunity.confidence,
        factors: topOpportunity.factors,
      });
    } catch (error) {
      logger.error('Error detecting opportunities', { userId, error });
    }
  }
}
