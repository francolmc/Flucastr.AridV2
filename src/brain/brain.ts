/**
 * Brain - Core Orchestrator
 * Manages conversation flow and LLM interaction
 */

import { LLMProvider } from '../llm/provider.interface.js';
import { ConversationStore } from '../storage/conversation.store.js';
import { ProfileStore } from '../storage/profile.store.js';
import { MemoryStore } from '../storage/memory.store.js';
import { ProspectiveMemoryStore } from '../storage/prospective-memory.store.js';
import { TokenTracker } from './token-tracker.js';
import { SystemPromptBuilder } from './system-prompt.js';
import { IntentAnalyzer } from './intent-analyzer.js';
import { MemoryExtractor } from './memory-extractor.js';
import { ProspectiveMemoryExtractor } from './prospective-memory-extractor.js';
import { ProspectiveCommandAnalyzer } from './prospective-command-analyzer.js';
import { ContextProvider } from '../context/context-provider.js';
import { LLMMessage, LLMResponse } from '../config/types.js';
import { detectImageMimeType } from '../hands/mime-types.js';
import { logger } from '../utils/logger.js';
import { ToolsAnalyzer } from '../hands/tools-analyzer.js';
import { ToolExecutor } from '../hands/tool-executor.js';
import { ToolActionsStore, ToolActionRequest } from '../hands/tool-actions.store.js';
import { BackgroundExecutor } from '../hands/background-executor.js';
import { SkillMatcher } from './skill-matcher.js';
import { SkillLoader } from './skill-loader.js';
import { SkillManager } from './skill-manager.js';
import { SkillThreadExecutor } from './skill-thread-executor.js';
import { SkillNotifications } from '../senses/telegram/skill-notifications.js';
import { SkillCredentialsFlow } from './skill-credentials-flow.js';
import { CredentialsStore } from '../storage/credentials.store.js';
import { SkillStore } from '../storage/skill.store.js';
import { AVAILABLE_TOOLS } from '../hands/tool-definitions.js';
import { AutonomousEngine } from '../autonomous/autonomous-engine.js';
import { ContextAnalyzer } from '../autonomous/context-analyzer.js';
import { AutonomousEventStore } from '../autonomous/event.store.js';
import { InterruptionPolicyStore } from '../autonomous/interruption-policy.store.js';
import { PatternDetector } from '../autonomous/pattern-detector.js';
import { PatternStore } from '../autonomous/pattern.store.js';
import { SkillEventMonitor } from '../autonomous/skill-event-monitor.js';
import { UserContextStore } from '../autonomous/user-context.store.js';
import { ActionCoordinator } from '../autonomous/action-coordinator.js';
import { RoutineScheduler } from '../autonomous/routine-scheduler.js';
import { RoutineGenerator } from '../autonomous/routine-generator.js';
import { ActionStore } from '../storage/action.store.js';
import { RoutineStore } from '../storage/routine.store.js';
import { EmergencyInterruptHandler } from '../autonomous/emergency-interrupt.js';
import { FeedbackProcessor } from '../autonomous/feedback-processor.js';
import { OpportunityDetector } from '../autonomous/opportunity-detector.js';
import { TaskQueueStore } from '../storage/task-queue.store.js';
import { AutonomousDaemon } from '../autonomous/autonomous-daemon.js';
import { ProjectStateTracker } from '../autonomous/project-state.js';
import { TaskReporter } from '../autonomous/task-reporter.js';
import { TaskEnqueuer } from '../autonomous/task-enqueuer.js';
import { BackupManager } from '../storage/backup-manager.js';

export interface BrainConfig {
  conversationProvider: LLMProvider;
  reasoningProvider: LLMProvider;
  analyzerProvider: LLMProvider;
  userDataPath: string;  // Path a workspace/ (PROFILE.md, skills, documentos, logs, uploads)
  tavilyApiKey?: string;
  storageEncryptionKey: string; // Fase 5: Para credenciales de skills
}

export class Brain {
  private conversationProvider: LLMProvider;
  private reasoningProvider: LLMProvider;
  private intentAnalyzer: IntentAnalyzer;
  private memoryExtractor: MemoryExtractor;
  private prospectiveExtractor: ProspectiveMemoryExtractor;
  private prospectiveCommandAnalyzer: ProspectiveCommandAnalyzer;
  private toolsAnalyzer: ToolsAnalyzer;
  private toolExecutor: ToolExecutor;
  private toolActionsStore: ToolActionsStore;
  private conversationStore: ConversationStore;
  private profileStore: ProfileStore;
  private memoryStore: MemoryStore;
  private prospectiveStore: ProspectiveMemoryStore;
  private tokenTracker: TokenTracker;
  // Fase 5: Skills system components
  private skillStore: SkillStore;
  private skillMatcher: SkillMatcher;
  private skillLoader: SkillLoader;
  private skillManager: SkillManager;
  private skillThreadExecutor: SkillThreadExecutor;
  private skillNotifications: SkillNotifications;
  private credentialsFlow: SkillCredentialsFlow;
  private credentialsStore: CredentialsStore;
  private storageEncryptionKey: string;
  
  // Fase 10: Autonomous Engine
  private autonomousEngine: AutonomousEngine;
  private autonomousEventStore: AutonomousEventStore;
  private userContextStore: UserContextStore;
  private interruptionPolicyStore: InterruptionPolicyStore;
  private patternStore: PatternStore;
  private patternDetector: PatternDetector;
  private skillEventMonitor: SkillEventMonitor;
  private contextAnalyzer: ContextAnalyzer;  // PASO 5: Context-aware interruption
  private actionStore: ActionStore;          // PASO 6: Autonomous Actions
  private actionCoordinator: ActionCoordinator; // PASO 6: Safe action execution
  private routineScheduler: RoutineScheduler; // PASO 7: Routine scheduling
  private routineGenerator: RoutineGenerator; // PASO 7: Routine content generation
  private routineStore: RoutineStore;        // PASO 7: Routine persistence
  private emergencyHandler: EmergencyInterruptHandler; // PASO 8: Emergency interrupts
  private feedbackProcessor: FeedbackProcessor; // PASO 9: Learning from feedback
  private opportunityDetector: OpportunityDetector; // PASO 10: Proactive opportunities
  
  // PASO 11: Task Daemon with Queue System
  private taskQueueStore: TaskQueueStore;
  private autonomousDaemon: AutonomousDaemon;
  private projectStateTracker: ProjectStateTracker;
  private taskReporter: TaskReporter;
  private taskEnqueuer: TaskEnqueuer;
  private backupManager: BackupManager;
  
  // Estado de flujo de credenciales en progreso
  // Mantiene contexto: "estoy esperando credencial X para skill Y"
  private pendingCredentialFlows: Map<string, {
    skillName: string;
    missingCredentials: string[];
    currentCredentialIndex: number;
  }> = new Map();

  constructor(config: BrainConfig) {
    this.conversationProvider = config.conversationProvider;
    this.reasoningProvider = config.reasoningProvider;
    this.intentAnalyzer = new IntentAnalyzer(config.analyzerProvider);
    this.memoryExtractor = new MemoryExtractor(config.analyzerProvider);
    this.prospectiveExtractor = new ProspectiveMemoryExtractor(config.analyzerProvider);
    this.prospectiveCommandAnalyzer = new ProspectiveCommandAnalyzer();
    this.toolsAnalyzer = new ToolsAnalyzer(config.analyzerProvider);
    this.toolExecutor = new ToolExecutor(config.userDataPath, config.tavilyApiKey);
    this.conversationStore = new ConversationStore();
    this.profileStore = new ProfileStore();
    this.memoryStore = new MemoryStore();
    this.prospectiveStore = new ProspectiveMemoryStore(this.conversationStore.getStore());
    this.toolActionsStore = new ToolActionsStore(this.conversationStore.getStore());
    this.tokenTracker = new TokenTracker();

    // Fase 5: Initialize skill components
    const credentialsStore = new CredentialsStore(config.storageEncryptionKey);
    const skillStore = new SkillStore(config.userDataPath);
    
    this.skillStore = skillStore;
    this.skillMatcher = new SkillMatcher(skillStore, config.analyzerProvider);
    this.skillLoader = new SkillLoader(skillStore);
    this.skillManager = new SkillManager(
      skillStore,
      credentialsStore,
      this.skillMatcher,
      this.skillLoader,
      this.toolActionsStore
    );
    this.skillThreadExecutor = new SkillThreadExecutor(config.userDataPath);
    this.skillNotifications = new SkillNotifications();
    this.credentialsStore = credentialsStore;
    this.storageEncryptionKey = config.storageEncryptionKey;
    this.credentialsFlow = new SkillCredentialsFlow(credentialsStore, this.toolActionsStore);

    // Fase 10: Initialize autonomous engine
    const storePath = this.conversationStore.getStore();
    this.autonomousEventStore = new AutonomousEventStore(storePath);
    this.userContextStore = new UserContextStore();
    this.interruptionPolicyStore = new InterruptionPolicyStore(storePath, this.userContextStore);
    this.patternStore = new PatternStore(storePath);
    this.skillEventMonitor = new SkillEventMonitor();
    
    // Crear PatternDetector para análisis de patrones de comportamiento
    this.patternDetector = new PatternDetector(this.conversationStore, this.patternStore);
    
    // PASO 5: Crear ContextAnalyzer para tomar decisiones inteligentes de interruption
    this.contextAnalyzer = new ContextAnalyzer(
      this.conversationStore,
      this.patternDetector,
      this.interruptionPolicyStore,
      this.userContextStore
    );
    
    // PASO 6: Crear ActionStore y ActionCoordinator para ejecución de acciones autónomas
    this.actionStore = new ActionStore(this.conversationStore.getStore());
    this.actionCoordinator = new ActionCoordinator(
      skillStore,
      this.actionStore,
      this.contextAnalyzer,
      this.interruptionPolicyStore,
      this.sendAutonomousNotification.bind(this)
    );

    // PASO 7: Crear componentes de rutinas (morning/evening, daily summaries, weekly planning)
    this.routineScheduler = new RoutineScheduler(this.patternDetector, this.userContextStore);
    this.routineGenerator = new RoutineGenerator(
      this.prospectiveStore,
      this.patternDetector,
      skillStore  // Para ContextProvider
    );
    this.routineStore = new RoutineStore(this.conversationStore.getStore());

    // PASO 8: Crear EmergencyInterruptHandler para alertas críticas
    this.emergencyHandler = new EmergencyInterruptHandler(this.interruptionPolicyStore);
    
    // PASO 9: Crear FeedbackProcessor para aprender del feedback del usuario
    this.feedbackProcessor = new FeedbackProcessor(this.conversationStore.getStore());
    
    // PASO 10: Crear OpportunityDetector para sugerencias proactivas
    this.opportunityDetector = new OpportunityDetector(
      this.patternDetector,
      this.prospectiveStore,
      skillStore
    );

    // PASO 11: Initialize Task Queue and Enqueuer BEFORE AutonomousEngine
    const jsonStore = this.conversationStore.getStore();
    this.taskQueueStore = new TaskQueueStore(jsonStore);
    this.projectStateTracker = new ProjectStateTracker(jsonStore);
    this.taskEnqueuer = new TaskEnqueuer(this.taskQueueStore);
    
    this.autonomousEngine = new AutonomousEngine(
      skillStore,
      this.prospectiveStore,
      this.interruptionPolicyStore,
      this.autonomousEventStore,
      this.patternDetector,
      this.skillEventMonitor,
      this.contextAnalyzer,
      this.userContextStore,
      this.actionCoordinator,
      this.sendAutonomousNotification.bind(this),
      this.routineScheduler,
      this.routineGenerator,
      this.routineStore,
      this.emergencyHandler,
      this.feedbackProcessor,
      this.opportunityDetector,
      this.taskEnqueuer
    );

    // PASO 11: Initialize Task Daemon and Reporter
    const telegramSender = this.sendAutonomousNotification.bind(this);
    this.taskReporter = new TaskReporter({
      policy: 'smart',
      telegramSender,
    });
    
    const backgroundExecutor = new BackgroundExecutor(config.userDataPath);
    
    this.autonomousDaemon = new AutonomousDaemon(
      this.taskQueueStore,
      backgroundExecutor,
      this.skillThreadExecutor
    );

    // PASO 11: Initialize BackupManager for production data backup
    const storeFilePath = jsonStore.getStorePath();
    this.backupManager = new BackupManager(
      config.userDataPath + '/data/backups',
      storeFilePath
    );

    logger.info('Brain initialized', {
      conversation: this.conversationProvider.getName(),
      reasoning: this.reasoningProvider.getName(),
      userDataPath: config.userDataPath,
      webSearchEnabled: !!config.tavilyApiKey
    });
  }

  /**
   * Process a user message and generate a response
   * May return a tool confirmation request or a string response
   *
   * @param options - Optional parameters:
   *   - imageUrl: Path to image file for vision analysis (Fase 8)
   *   - documentPath: Path to document file (Fase 8)
   */
  async processMessage(
    userId: string,
    text: string,
    options?: {
      imageUrl?: string;
      documentPath?: string;
    }
  ): Promise<string | { requiresConfirmation: true; request: ToolActionRequest }> {
    const timestamp = Date.now();

    try {
      // 0. PRIORITY: Check if user is in the middle of providing credentials
      const pendingFlow = this.pendingCredentialFlows.get(userId);
      if (pendingFlow) {
        logger.info('Processing message as pending credential', {
          userId,
          skillName: pendingFlow.skillName,
          waitingFor: pendingFlow.missingCredentials[pendingFlow.currentCredentialIndex],
          remainingCount: pendingFlow.missingCredentials.length - pendingFlow.currentCredentialIndex
        });
        
        return await this.processPendingCredential(userId, text, timestamp, pendingFlow);
      }

      // 0.1 Record interaction for autonomous engine's interruption intelligence
      this.autonomousEngine.recordInteraction(userId);
      
      // 1. Get conversation history
      const history = this.conversationStore.getHistory(userId, 40);

      // 2. Get user profile
      const profile = this.profileStore.getProfile(userId);

      // 3. Get memories (top 15 most important)
      const memories = this.memoryStore.getMemories(userId, 15);

      // 4. Get temporal/spatial context (Fase 3)
      const context = ContextProvider.getContext(profile);

      // 5a. Match relevant skills (Fase 5)
      let matchedSkills: any[] = [];
      try {
        matchedSkills = await this.skillMatcher.matchSkills(userId, text);
        
        logger.debug('Skill matching completed', {
          userId,
          messageLength: text.length,
          matchCount: matchedSkills.length,
          skills: matchedSkills.map(s => ({ name: s.name, confidence: s.confidence }))
        });

        if (matchedSkills.length > 0) {
          logger.info('Matched skills for user message', {
            userId,
            matchCount: matchedSkills.length,
            skills: matchedSkills.map(s => s.name)
          });
        } else {
          logger.debug('No skills matched', { userId, messageLength: text.length });
        }
      } catch (error) {
        logger.warn('Failed to match skills', { userId, error: String(error) });
      }

      // 5a-bis. If no skills matched but we're in credential flow, force load the active skill
      if (matchedSkills.length === 0) {
        const activeSkillFromCredentialFlow = await this.detectActiveCredentialFlow(history);
        if (activeSkillFromCredentialFlow) {
          logger.info('No skills matched but credential flow detected', {
            userId,
            activeSkill: activeSkillFromCredentialFlow,
            messagePreview: text.substring(0, 100)
          });
          
          // Force this skill to be loaded
          matchedSkills = [{
            name: activeSkillFromCredentialFlow,
            confidence: 1.0,
            source: 'credential-flow-context'
          }];
        }
      }

      // 5b. Load matched skills (Fase 5)
      let loadedSkillsMarkdown = '';
      let missingCredentials: string[] = [];
      
      if (matchedSkills.length > 0) {
        try {
          const topSkills = matchedSkills.slice(0, 3); // Limit to top 3
          const skillInstructions: string[] = [];

          for (const skill of topSkills) {
            const loaded = await this.skillLoader.loadSkill(userId, skill.name);
            if (loaded) {
              let instructions = loaded.instructions;
              
              // 5c. Check if skill requires credentials that user doesn't have (Fase 5)
              if (loaded.metadata.requiredEnv && loaded.metadata.requiredEnv.length > 0) {
                const creds = this.credentialsStore.getCredentials(userId, skill.name);
                for (const env of loaded.metadata.requiredEnv) {
                  if (!creds[env]) {
                    missingCredentials.push(env);
                  } else {
                    // Replace environment variables in instructions with actual values
                    const envPattern = new RegExp(`\\$${env}\\b`, 'g');
                    instructions = instructions.replace(envPattern, creds[env]);
                  }
                }
              }
              
              skillInstructions.push(`## Skill: ${loaded.metadata.name}\n${instructions}`);
            }
          }

          if (skillInstructions.length > 0) {
            loadedSkillsMarkdown = skillInstructions.join('\n\n---\n\n');
            logger.info('Loaded skill instructions', {
              userId,
              skillCount: skillInstructions.length,
              missingCredentials: missingCredentials.length
            });
          }
        } catch (error) {
          logger.warn('Failed to load matched skills', { userId, error });
        }
      }

      // 5d. If skills require credentials user doesn't have, ask conversationally (Fase 5)
      if (missingCredentials.length > 0) {
        const skillName = matchedSkills[0]?.name || 'unknown-skill';
        
        // Initialize credential flow state
        this.pendingCredentialFlows.set(userId, {
          skillName,
          missingCredentials,
          currentCredentialIndex: 0
        });
        
        logger.info('Initialized credential flow state', {
          userId,
          skillName,
          credentialsNeeded: missingCredentials
        });
        
        // Check if user is responding with a credential by checking context:
        // 1. Was the last assistant message asking for a credential?
        // 2. Does the current message look like a token/API key?
        const requestedCredentialName = missingCredentials[0];
        const extractedCredential = this.extractCredentialFromMessage(history, text, requestedCredentialName);
        
        logger.info('Credential extraction attempt', {
          userId,
          messageLength: text.length,
          messagePreview: text.substring(0, 100),
          requestedCredential: requestedCredentialName,
          credentialExtracted: !!extractedCredential,
          credentialLength: extractedCredential?.length || 0
        });
        
        if (extractedCredential) {
          try {
            // Infer skill name from credential name if matchedSkills is empty
            let skillName = matchedSkills[0]?.name;
            if (!skillName) {
              const credName = missingCredentials[0];
              if (credName.startsWith('HOME_ASSISTANT_')) {
                skillName = 'controlar-home-assistant';
              } else if (credName.startsWith('GITHUB_')) {
                skillName = 'github-intergration';
              } else if (credName.startsWith('GMAIL_')) {
                skillName = 'gmail-integration';
              } else {
                // Try to extract from history - look for skill in recent messages
                skillName = this.extractSkillNameFromHistory(history, credName) || 'unknown-skill';
              }
              logger.info('Inferred skill name from credential context', { 
                credentialName: credName, 
                inferredSkill: skillName 
              });
            }
            const credentialName = missingCredentials[0];
            this.credentialsStore.saveCredential(userId, skillName, credentialName, extractedCredential);
            logger.info('Credential saved for skill', { 
              userId, 
              skillName, 
              credentialName,
              credentialLength: extractedCredential.length 
            });
            
            // Remove the credential we just saved from the missing list
            missingCredentials = missingCredentials.filter(c => c !== credentialName);
            
            // If more credentials needed, ask for next one
            if (missingCredentials.length > 0) {
              const credList = missingCredentials.slice(0, 3).map(c => `**${c}**`).join(', ');
              const responseMessage = `✅ Guardé tu ${credentialName}.\n\nAhora necesito: ${credList}\n\n💡 **¿Puedes compartir tu ${missingCredentials[0]}?** (Se guardará encriptado de forma segura)`;
              
              // Save both user and assistant messages before returning
              this.conversationStore.saveMessage({
                userId,
                role: 'user',
                content: text,
                timestamp
              });
              
              this.conversationStore.saveMessage({
                userId,
                role: 'assistant',
                content: responseMessage,
                timestamp: Date.now()
              });
              
              return responseMessage;
            }
            
            // ✅ FIX: All credentials saved, confirm and return
            const confirmationMessage = `✅ Perfecto, guardé tu **${credentialName}**.\n\n🎉 Ahora tengo todas las credenciales necesarias para usar **${skillName}**.\n\n¿Qué te gustaría hacer?`;

            // Save both messages
            this.conversationStore.saveMessage({
              userId,
              role: 'user',
              content: text,
              timestamp
            });

            this.conversationStore.saveMessage({
              userId,
              role: 'assistant',
              content: confirmationMessage,
              timestamp: Date.now()
            });

            logger.info('All credentials saved for skill', {
              userId,
              skillName
            });

            return confirmationMessage;
          } catch (error) {
            logger.error('Failed to save credential', { userId, error });
            const errorMessage = `Hubo un error al guardar tu ${missingCredentials[0]}. Por favor intenta de nuevo.`;
            
            // Save messages even on error
            this.conversationStore.saveMessage({
              userId,
              role: 'user',
              content: text,
              timestamp
            });
            
            this.conversationStore.saveMessage({
              userId,
              role: 'assistant',
              content: errorMessage,
              timestamp: Date.now()
            });
            
            return errorMessage;
          }
        } else {
          // User hasn't provided credential yet, ask conversationally
          const credList = missingCredentials.slice(0, 3).map(c => `**${c}**`).join(', ');
          const requestMessage = `Para acceder necesito: ${credList}\n\n💡 **¿Puedes compartir tu ${missingCredentials[0]}?** (Se guardará encriptado de forma segura)`;
          
          // Save both user and assistant messages before returning
          this.conversationStore.saveMessage({
            userId,
            role: 'user',
            content: text,
            timestamp
          });
          
          this.conversationStore.saveMessage({
            userId,
            role: 'assistant',
            content: requestMessage,
            timestamp: Date.now()
          });
          
          return requestMessage;
        }
      }

      // 5. Get prospective memories (Fase 6)
      const prospectives = this.prospectiveStore.getPending(userId);

      // 6. Update prospective statuses based on current time
      await this.updateProspectiveStatuses(userId, prospectives);

      // 7. Analyze if message requires tool usage (Fase 7)
      const toolRequest = await this.toolsAnalyzer.analyzeToolRequest(
        text,
        history.slice(-3).map(m => `${m.role}: ${m.content}`)
      );

      // If tool detected with high confidence
      if (toolRequest.action && toolRequest.confidence >= 0.7) {
        logger.info('Tool request detected', {
          userId,
          action: toolRequest.action,
          targetResource: toolRequest.targetResource,
          requiresConfirmation: toolRequest.requiresConfirmation,
          confidence: toolRequest.confidence
        });

        // If requires confirmation, create pending request
        if (toolRequest.requiresConfirmation) {
          const request = this.toolActionsStore.createRequest(
            userId,
            toolRequest.action,
            toolRequest.targetResource,
            toolRequest.description,
            toolRequest.parameters
          );

          return {
            requiresConfirmation: true,
            request
          };
        }

        // Execute immediately without confirmation (read operations)
        const executionResult = await this.toolExecutor.execute(
          toolRequest.action,
          toolRequest.targetResource,
          toolRequest.parameters
        );

        // Integrate result into conversation and continue with LLM
        const toolResultMessage = executionResult.success
          ? `[RESULTADO DE HERRAMIENTA]\nAcción: ${toolRequest.action}\nResultado:\n${executionResult.output}\n\nDuración: ${executionResult.durationMs}ms\n\nExplica brevemente qué obtuvimos y cómo responde a la solicitud del usuario.`
          : `[ERROR DE HERRAMIENTA]\nAcción: ${toolRequest.action}\nError:\n${executionResult.output}\n\nExplica el error al usuario de forma clara.`;

        // Replace user text with tool result for LLM context
        text = toolResultMessage;

        logger.info('Tool executed without confirmation', {
          userId,
          action: toolRequest.action,
          success: executionResult.success,
          duration: executionResult.durationMs
        });
      }

      // 8. Check for prospective commands in conversation (Fase 6 enhancement)
      const prospectiveCommand = this.prospectiveCommandAnalyzer.analyzeCommand(text);
      let prospectiveCommandMessage = '';

      if (prospectiveCommand.action && prospectiveCommand.confidence >= 0.7) {
        const targetProspective = this.prospectiveCommandAnalyzer.findProspective(
          prospectives,
          prospectiveCommand.targetContent!
        );

        if (targetProspective) {
          if (prospectiveCommand.action === 'complete') {
            this.prospectiveStore.markCompleted(userId, targetProspective.id);
            prospectiveCommandMessage = `✅ He marcado como completada: "${targetProspective.content}"`;
            logger.info('Prospective completed via conversational command', {
              userId,
              prospectiveId: targetProspective.id,
              content: targetProspective.content
            });
          } else if (prospectiveCommand.action === 'delete') {
            this.prospectiveStore.deleteProspective(userId, targetProspective.id);
            prospectiveCommandMessage = `🗑️ He eliminado: "${targetProspective.content}"`;
            logger.info('Prospective deleted via conversational command', {
              userId,
              prospectiveId: targetProspective.id,
              content: targetProspective.content
            });
          } else if (prospectiveCommand.action === 'cancel') {
            this.prospectiveStore.markCancelled(userId, targetProspective.id);
            prospectiveCommandMessage = `🚫 He cancelado: "${targetProspective.content}"`;
            logger.info('Prospective cancelled via conversational command', {
              userId,
              prospectiveId: targetProspective.id,
              content: targetProspective.content
            });
          }

          // Re-get prospectives after modification
          prospectives.splice(prospectives.findIndex(p => p.id === targetProspective.id), 1);
        }
      }

      logger.debug('Context retrieved', {
        userId,
        historyCount: history.length,
        memoriesCount: memories.length,
        prospectivesCount: prospectives.length,
        timezone: context.temporal.timezone,
        partOfDay: context.temporal.partOfDay
      });

      // 9. Analyze intent to decide which model to use
      const conversationContext = history
        .slice(-3)
        .map(m => `${m.role}: ${m.content}`);

      const intent = await this.intentAnalyzer.analyze(text, conversationContext);

      logger.info('Message intent analyzed', {
        userId,
        needsReasoning: intent.needsReasoning,
        complexity: intent.complexity,
        confidence: intent.confidence
      });

      // 10. Select provider based on intent
      const provider = intent.needsReasoning
        ? this.reasoningProvider
        : this.conversationProvider;

      logger.info('Provider selected', {
        provider: provider.getName(),
        model: provider.getModel(),
        reasoning: intent.reasoning
      });

      // 9a. Inject skills into system prompt (Fase 5)
      let systemPromptWithSkills = SystemPromptBuilder.build(profile, memories, context, prospectives);
      
      if (loadedSkillsMarkdown) {
        // Append skills section to system prompt
        systemPromptWithSkills += '\n\n' +
          '## SKILLS DISPONIBLES\n' +
          'Los siguientes skills especializados están disponibles para ayudarte:\n\n' +
          loadedSkillsMarkdown + '\n\n' +
          '⚠️ **REGLA CRÍTICA DE SEGURIDAD**: NUNCA muestres tokens, API keys, passwords o credenciales completas en tus respuestas al usuario. ' +
          'Si necesitas mostrar un comando, usa placeholders como `$GITHUB_TOKEN` o `***` en lugar del valor real. ' +
          'Los tokens ya están configurados internamente y se usarán automáticamente cuando ejecutes comandos.\n\n' +
          '🔧 **REGLA CRÍTICA DE EJECUCIÓN**: Cuando un skill requiera ejecutar un comando shell (curl, git, npm, etc.), ' +
          'debes solicitar explícitamente la ejecución del comando. Por ejemplo:\n' +
          '- Usuario: "muestra mis repos de github"\n' +
          '- Tú: Solicita ejecutar: `curl -s -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user/repos`\n' +
          '- Sistema: [ejecuta y te devuelve resultado]\n' +
          '- Tú: [interpretas JSON y presentas al usuario]\n\n' +
          'NO inventes respuestas sin ejecutar comandos cuando el skill lo requiera. SIEMPRE ejecuta primero, luego interpreta.';
        
        logger.info('Injected skills into system prompt', {
          userId,
          skillCount: matchedSkills.length,
          promptLength: systemPromptWithSkills.length
        });
      }

      // 11. Build system prompt with memories, context, and prospectives
      const systemPrompt = systemPromptWithSkills;

      // 12. Prepare messages for LLM (with optional image support - Fase 8)
      let messages: LLMMessage[] = [];

      if (options?.imageUrl) {
        // PASO 8 NUEVO: Multimodal message with image
        const fs = await import('fs/promises');
        const imageBuffer = await fs.readFile(options.imageUrl);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = this.getImageMimeType(options.imageUrl);

        logger.info('Processing message with image', {
          userId,
          imagePath: options.imageUrl,
          mimeType
        });

        // Construct multimodal message
        messages = [
          ...history.map(h => ({
            role: h.role,
            content: h.content
          })),
          {
            role: 'user' as const,
            content: [
              {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: mimeType,
                  data: base64Image
                }
              },
              {
                type: 'text' as const,
                text: text
              }
            ]
          }
        ];
      } else {
        // Normal text-only message
        messages = [
          ...history.map(h => ({
            role: h.role,
            content: h.content
          })),
          { role: 'user' as const, content: text }
        ];
      }

      // 13. Generate response with agentic tool use loop
      let llmResponse: LLMResponse;
      let currentMessages = [...messages];
      const maxToolIterations = 5;  // Prevent infinite loops
      let toolIterations = 0;
      
      // Enable tools only for conversation provider (not for reasoning)
      const enableTools = provider === this.conversationProvider && matchedSkills.length > 0;
      
      while (toolIterations < maxToolIterations) {
        const response = await provider.generateContent(
          currentMessages,
          systemPrompt,
          enableTools ? AVAILABLE_TOOLS : undefined
        );
        
        // If no tool calls, we're done
        if (!response.toolCalls || response.toolCalls.length === 0) {
          llmResponse = response;
          break;
        }
        
        // Execute each tool call
        logger.info('LLM requested tool use', {
          userId,
          toolCount: response.toolCalls.length,
          tools: response.toolCalls.map(t => t.name)
        });
        
        // Add assistant message with tool use to conversation
        // Include both text and tool_use blocks
        const assistantContent: any[] = [];
        
        // Add text if present
        if (response.content) {
          assistantContent.push({
            type: 'text',
            text: response.content
          });
        }
        
        // Add tool_use blocks
        for (const toolCall of response.toolCalls) {
          assistantContent.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.input
          });
        }
        
        currentMessages.push({
          role: 'assistant' as const,
          content: assistantContent
        });
        
        // Execute tools and add results
        for (const toolCall of response.toolCalls) {
          logger.info('Executing tool', {
            userId,
            toolName: toolCall.name,
            toolId: toolCall.id,
            input: toolCall.input
          });
          
          let toolResult: any;
          try {
            // Map tool calls to ToolExecutor methods
            if (toolCall.name === 'execute_command') {
              const result = await this.toolExecutor.execute(
                'execute_command',
                toolCall.input.command,  // El comando va en targetResource
                {}
              );
              toolResult = result.success
                ? { success: true, output: result.output }
                : { success: false, error: result.output };
            } else if (toolCall.name === 'read_file') {
              const result = await this.toolExecutor.execute(
                'read_file',
                toolCall.input.file_path,
                {}
              );
              toolResult = result.success
                ? { success: true, content: result.output }
                : { success: false, error: result.output };
            } else if (toolCall.name === 'write_file') {
              const result = await this.toolExecutor.execute(
                'write_file',
                toolCall.input.file_path,
                { content: toolCall.input.content }
              );
              toolResult = result.success
                ? { success: true, message: 'File written successfully' }
                : { success: false, error: result.output };
            } else if (toolCall.name === 'web_search') {
              const result = await this.toolExecutor.execute(
                'web_search',
                toolCall.input.query,
                { maxResults: toolCall.input.max_results || 5 }
              );
              toolResult = result.success
                ? { success: true, results: JSON.parse(result.output) }
                : { success: false, error: result.output };
            } else {
              toolResult = { success: false, error: 'Unknown tool' };
            }
            
            logger.info('Tool executed', {
              userId,
              toolName: toolCall.name,
              toolId: toolCall.id,
              success: toolResult.success
            });
          } catch (error) {
            logger.error('Tool execution error', {
              userId,
              toolName: toolCall.name,
              error: String(error)
            });
            toolResult = { success: false, error: String(error) };
          }
          
          // Add tool result to messages
          // Note: Anthropic expects tool_result as content block
          currentMessages.push({
            role: 'user' as const,
            content: [
              {
                type: 'tool_result' as const,
                tool_use_id: toolCall.id,
                content: JSON.stringify(toolResult)
              }
            ] as any
          });
        }
        
        toolIterations++;
      }
      
      if (toolIterations >= maxToolIterations) {
        logger.warn('Max tool iterations reached', { userId, iterations: toolIterations });
        llmResponse = {
          content: 'Lo siento, no pude completar la operación después de varios intentos.',
          stopReason: 'max_tokens',
          usage: { inputTokens: 0, outputTokens: 0 }
        };
      }

      const response = llmResponse!;

      // 14. Save user message
      this.conversationStore.saveMessage({
        userId,
        role: 'user',
        content: text,
        timestamp
      });

      // 15. Save assistant response
      this.conversationStore.saveMessage({
        userId,
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
        modelUsed: provider.getName()
      });

      // 16. Extract and save new memories (retrospective)
      const recentMessages = this.conversationStore.getHistory(userId, 6);
      const newMemories = await this.memoryExtractor.extractMemories(
        userId,
        recentMessages,
        memories
      );

      if (newMemories.length > 0) {
        for (const memory of newMemories) {
          this.memoryStore.saveMemory(memory);
          logger.info('New memory extracted', {
            userId,
            category: memory.category,
            importance: memory.importance,
            content: memory.content.substring(0, 50) + '...'
          });
        }
      }

      // 16a. Detect skill creation suggestions (Fase 5)
      try {
        const skillSuggestion = await this.skillManager.suggestSkillCreation(userId, recentMessages);
        if (skillSuggestion) {
          logger.info('Skill creation suggested', {
            userId,
            pattern: skillSuggestion.pattern,
            frequency: skillSuggestion.frequency
          });
          // TODO: Send notifications via Telegram to suggest skill creation
        }
      } catch (error) {
        logger.warn('Failed to suggest skill creation', { userId, error });
      }

      // 16b. Detect skill operations (create, edit, delete, list) (Fase 5)
      let skillOperationResult: string | null = null;
      try {
        const skillOperation = await this.skillManager.detectSkillOperation(text, userId);
        if (skillOperation && skillOperation.operation) {
          logger.info('Skill operation detected', {
            userId,
            operation: skillOperation.operation,
            skillName: skillOperation.skillName
          });

          // Handle skill operations based on type
          if (skillOperation.operation === 'create') {
            // Skill creation will be handled via ToolActionsStore confirmation
            skillOperationResult = `Skill creation requested: ${skillOperation.skillName || 'unnamed'}`;
          } else if (skillOperation.operation === 'list') {
            const userSkills = await this.skillManager.listUserSkills(userId);
            if (userSkills.length > 0) {
              skillOperationResult = `📚 Tus skills:\n${userSkills.map((s: any) => `- ${s.name}: ${s.description}`).join('\n')}`;
            } else {
              skillOperationResult = 'No tienes skills creados aún.';
            }
          }
        }
      } catch (error) {
        logger.warn('Failed to detect skill operations', { userId, error });
      }

      // 17. Extract and save new prospective memories (Fase 6)
      const newProspectives = await this.prospectiveExtractor.extractProspectives(
        userId,
        recentMessages,
        prospectives,
        context
      );

      let savedProspectives = 0;
      if (newProspectives.length > 0) {
        for (const prospective of newProspectives) {
          const saved = this.prospectiveStore.saveProspective(prospective);
          if (saved) {
            savedProspectives++;
            logger.info('New prospective extracted', {
              userId,
              type: prospective.type,
              priority: prospective.priority,
              content: prospective.content?.substring(0, 50) + '...'
            });
          }
        }
      }

      // 18. Detect prospective completions (Fase 6)
      await this.detectProspectiveCompletions(userId, text, response.content, prospectives);

      // 19. Track token usage
      this.tokenTracker.track(userId, provider.getName(), response.usage);

      logger.info('Message processed', {
        userId,
        provider: provider.getName(),
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        newMemories: newMemories.length,
        extractedProspectives: newProspectives.length,
        savedProspectives: savedProspectives,
        prospectiveCommand: prospectiveCommand.action
      });

      // Combine prospective command message with normal response
      let finalResponse = response.content;

      if (prospectiveCommandMessage) {
        finalResponse = `${prospectiveCommandMessage}\n\n${finalResponse}`;
      }

      if (skillOperationResult) {
        finalResponse = `${skillOperationResult}\n\n${finalResponse}`;
      }

      // Security: Redact any tokens that might have leaked into LLM response
      const allCreds = this.credentialsStore.getAllUserCredentials(userId);
      for (const [skillName, credObj] of Object.entries(allCreds)) {
        for (const [credName, credValue] of Object.entries(credObj)) {
          if (credValue && credValue.length > 20) {
            // Replace any occurrence of the credential with [REDACTED]
            const credRegex = new RegExp(credValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            finalResponse = finalResponse.replace(credRegex, '[REDACTED_TOKEN]');
          }
        }
      }

      return finalResponse;
    } catch (error) {
      logger.error('Failed to process message', error);
      throw error;
    }
  }

  /**
   * Get token statistics for a user
   */
  getTokenStats(userId: string, days: number = 7) {
    return this.tokenTracker.getStats(userId, days);
  }

  /**
   * Get total token statistics for a user
   */
  getTotalTokenStats(userId: string) {
    return this.tokenTracker.getTotalStats(userId);
  }

  /**
   * Clear conversation history for a user
   */
  clearHistory(userId: string): void {
    this.conversationStore.clearHistory(userId);
    logger.info('Conversation history cleared', { userId });
  }

  /**
   * Get conversation message count
   */
  getMessageCount(userId: string): number {
    return this.conversationStore.getMessageCount(userId);
  }

  /**
   * Get user memories
   */
  getMemories(userId: string, limit?: number) {
    return this.memoryStore.getMemories(userId, limit);
  }

  /**
   * Get memory count
   */
  getMemoryCount(userId: string): number {
    return this.memoryStore.getCount(userId);
  }

  /**
   * Get prospective memories
   */
  getProspectives(userId: string) {
    return this.prospectiveStore.getPending(userId);
  }

  /**
   * Get prospective memory count
   */
  getProspectiveCount(userId: string): number {
    return this.prospectiveStore.getPending(userId).length;
  }

  /**
   * Get tool actions store (Fase 7)
   */
  getToolActionsStore(): ToolActionsStore {
    return this.toolActionsStore;
  }

  /**
   * Get tool executor (Fase 7)
   */
  getToolExecutor(): ToolExecutor {
    return this.toolExecutor;
  }

  /**
   * Mark prospective as completed
   */
  markProspectiveCompleted(userId: string, id: string): void {
    this.prospectiveStore.markCompleted(userId, id);
  }

  /**
   * Mark prospective as cancelled
   */
  markProspectiveCancelled(userId: string, id: string): void {
    this.prospectiveStore.markCancelled(userId, id);
  }

  /**
   * Delete prospective (Fase 6)
   */
  deleteProspective(userId: string, id: string): void {
    this.prospectiveStore.deleteProspective(userId, id);
  }

  /**
   * Get user profile
   */
  getProfile(userId: string) {
    return this.profileStore.getProfile(userId);
  }

  /**
   * Update prospective statuses based on current time (Fase 6)
   */
  private async updateProspectiveStatuses(userId: string, prospectives: any[]): Promise<void> {
    const now = new Date();

    for (const p of prospectives) {
      if (p.status === 'pending' && p.dueDate && new Date(p.dueDate) < now) {
        // Cambiar a overdue si pasó la fecha
        this.prospectiveStore.updateStatus(userId, p.id, 'overdue');
      }

      // Si es recurrente y pasó, calcular próxima ocurrencia
      if (p.recurrence && p.nextOccurrence && new Date(p.nextOccurrence) < now) {
        const next = this.prospectiveStore.calculateNextOccurrence(p);
        if (next) {
          this.prospectiveStore.updateProspective(userId, p.id, {
            nextOccurrence: next
          });
        }
      }
    }
  }

  /**
   * Detect if user mentioned completing a prospective (Fase 6)
   */
  private async detectProspectiveCompletions(
    userId: string,
    userMessage: string,
    assistantResponse: string,
    prospectives: any[]
  ): Promise<void> {
    // Implementación simple: buscar palabras clave de completion
    const completionKeywords = [
      'ya hice',
      'ya llamé',
      'ya terminé',
      'ya compré',
      'ya fui',
      'listo',
      'hecho',
      'completado'
    ];

    const lowerMessage = userMessage.toLowerCase();
    const hasCompletionIntent = completionKeywords.some(keyword => lowerMessage.includes(keyword));

    if (!hasCompletionIntent || prospectives.length === 0) {
      return;
    }

    // Buscar coincidencias en prospectives pendientes
    for (const p of prospectives) {
      const contentWords = p.content.toLowerCase().split(' ');
      let matchCount = 0;

      for (const word of contentWords) {
        if (word.length > 3 && lowerMessage.includes(word)) {
          matchCount++;
        }
      }

      // Si hay suficientes coincidencias, marcar como completada
      if (matchCount >= 2) {
        this.prospectiveStore.markCompleted(userId, p.id);
        logger.info('Prospective auto-completed based on user message', {
          userId,
          prospectiveId: p.id,
          content: p.content
        });
      }
    }
  }

  /**
   * Check if user is responding with a credential based on conversation context
   * Generic approach: detects if last assistant message asked for credential,
   * and current message looks like a token/API key (works for all types)
   */
  private extractCredentialFromMessage(history: any[], currentMessage: string, requestedCredentialName?: string): string | null {
    // 1. Check if last assistant message asked for a credential
    const lastAssistantMessage = [...history]
      .reverse()
      .find((m: any) => m.role === 'assistant');
    
    if (!lastAssistantMessage) {
      logger.info('Cannot extract credential: no assistant message found in history');
      return null;
    }

    const assistantContent = lastAssistantMessage.content.toLowerCase();
    
    // Keywords that indicate asking for credential (Spanish + English)
    const credentialRequestKeywords = [
      'compartir',      // compartir tu...
      'credential',
      'credenciales',
      'token',
      'clave',
      'contraseña',
      'password',
      'api key',
      'api_key',
      'secret',
      'secreto',
      'autenticación',
      'authentication',
      'oauth',
      'bearer',
      'username',
      'user',
      'usuario',
      'url',            // For HOME_ASSISTANT_URL, etc
      'host',
      'endpoint'
    ];

    const asksForCredential = credentialRequestKeywords.some(keyword =>
      assistantContent.includes(keyword)
    );

    if (!asksForCredential) {
      logger.info('Cannot extract credential: assistant did not ask for one', {
        messagePreview: assistantContent.substring(0, 100)
      });
      return null;
    }

    logger.info('Attempting to extract credential from message', {
      messageLength: currentMessage.length,
      messagePreview: currentMessage.substring(0, 150),
      requestedType: requestedCredentialName
    });

    // Determine if we're looking for a username/email (short), token/key (long), or URL
    const isUsername = requestedCredentialName?.toLowerCase().includes('username') ||
                       requestedCredentialName?.toLowerCase().includes('user') ||
                       requestedCredentialName?.toLowerCase().includes('email');
    
    const isUrl = requestedCredentialName?.toLowerCase().includes('url') ||
                  requestedCredentialName?.toLowerCase().includes('host') ||
                  requestedCredentialName?.toLowerCase().includes('endpoint');

    // 2. Extract token-like strings from message
    // Strategy: look for long alphanumeric strings (20+ chars) that look like tokens
    
    // First, check if it's a URL (for HOME_ASSISTANT_URL, OPENAI_URL, etc)
    if (isUrl) {
      const urlPattern = /(https?:\/\/[^\s]+)/gi;
      const urlMatch = currentMessage.match(urlPattern);
      if (urlMatch && urlMatch[0]) {
        const url = urlMatch[0].trim();
        logger.info('Extracted URL as credential', {
          length: url.length,
          value: url
        });
        return url;
      }
      
      // Also check for localhost URLs without protocol
      const localhostPattern = /(localhost:[0-9]{2,5})/gi;
      const localhostMatch = currentMessage.match(localhostPattern);
      if (localhostMatch && localhostMatch[0]) {
        const url = 'http://' + localhostMatch[0];
        logger.info('Extracted localhost URL as credential', {
          value: url
        });
        return url;
      }
    }
    
    // First, try common token prefixes (github_pat_, bearer, sk_, pk_, etc)
    const prefixPatterns = [
      { pattern: /github_pat_[a-zA-Z0-9_-]+/g, name: 'github_pat' },
      { pattern: /github_[a-zA-Z0-9_-]+/g, name: 'github' },
      { pattern: /bearer\s+([a-zA-Z0-9_\-.:]+)/gi, name: 'bearer' },
      { pattern: /sk_[a-zA-Z0-9_-]+/g, name: 'openai' },
      { pattern: /pk_[a-zA-Z0-9_-]+/g, name: 'stripe' }
    ];

    for (const { pattern, name } of prefixPatterns) {
      const match = currentMessage.match(pattern);
      if (match) {
        const token = match[0];
        if (token && token.length >= 8) {
          logger.info('Extracted credential', {
            type: name,
            length: token.length,
            preview: token.substring(0, 40) + '...'
          });
          return token;
        }
      }
    }

    // If no prefix patterns matched, look for alphanumeric strings
    // Split by whitespace and = signs
    const parts = currentMessage.split(/[\s=]+/);
    
    for (const part of parts) {
      const trimmed = part.trim();
      
      // For usernames: accept shorter strings (3-50 chars, alphanumeric + some special chars)
      if (isUsername && trimmed.length >= 3 && trimmed.length <= 50 && /^[a-zA-Z0-9_\-@.]+$/.test(trimmed)) {
        // Additional check: should not be common words
        const commonWords = ['github', 'username', 'user', 'name', 'token', 'clave', 'password', 'email'];
        if (!commonWords.includes(trimmed.toLowerCase())) {
          logger.info('Extracted username/email as credential', {
            length: trimmed.length,
            value: trimmed
          });
          return trimmed;
        }
      }
      
      // For tokens/keys: require 30+ characters
      if (!isUsername && trimmed.length >= 30 && /^[a-zA-Z0-9_\-.:]+$/.test(trimmed)) {
        logger.info('Extracted long alphanumeric string as credential', {
          length: trimmed.length,
          preview: trimmed.substring(0, 40) + '...'
        });
        return trimmed;
      }
    }

    logger.info('No credential pattern found in message', {
      messagePreview: currentMessage.substring(0, 150),
      parts: parts.length,
      isUsername
    });

    return null;
  }

  /**
   * Extract skill name from conversation history by looking at recent skill context
   * Used when user responds with credential but skill matcher doesn't re-match
   */
  private extractSkillNameFromHistory(history: any[], credentialName: string): string | null {
    // Look through recent messages for skill references
    const recentMessages = history.slice(-5); // Last 5 messages
    
    for (const msg of recentMessages) {
      const content = msg.content?.toLowerCase() || '';
      
      // Check for skill-specific keywords
      if (content.includes('home assistant') || content.includes('homeassistant')) {
        return 'controlar-home-assistant';
      }
      if (content.includes('github') || content.includes('repositorio')) {
        return 'github-intergration';
      }
      if (content.includes('gmail') || content.includes('correo')) {
        return 'gmail-integration';
      }
      if (content.includes('docker') || content.includes('contenedor')) {
        return 'docker-skill';
      }
    }
    
    logger.info('Could not extract skill name from history', { credentialName });
    return null;
  }

  /**
   * Process a message when we know user is providing a credential
   * This is called when pendingCredentialFlows has an active flow for this user
   */
  private async processPendingCredential(
    userId: string,
    text: string,
    timestamp: number,
    pendingFlow: { skillName: string; missingCredentials: string[]; currentCredentialIndex: number }
  ): Promise<string> {
    const currentCredential = pendingFlow.missingCredentials[pendingFlow.currentCredentialIndex];
    
    // Extract credential value from message
    const credentialValue = text.trim();
    
    // Basic validation
    if (credentialValue.length === 0) {
      return `El valor está vacío. Por favor envía tu **${currentCredential}**.`;
    }
    
    if (credentialValue.length > 5000) {
      return `El valor es muy largo (máximo 5000 caracteres). Por favor verifica tu **${currentCredential}**.`;
    }
    
    try {
      // Save credential
      this.credentialsStore.saveCredential(userId, pendingFlow.skillName, currentCredential, credentialValue);
      
      logger.info('Credential saved from pending flow', {
        userId,
        skillName: pendingFlow.skillName,
        credentialName: currentCredential,
        credentialLength: credentialValue.length
      });
      
      // Save user message
      this.conversationStore.saveMessage({
        userId,
        role: 'user',
        content: text,
        timestamp
      });
      
      // Move to next credential or finish
      pendingFlow.currentCredentialIndex++;
      
      if (pendingFlow.currentCredentialIndex < pendingFlow.missingCredentials.length) {
        // More credentials needed
        const nextCredential = pendingFlow.missingCredentials[pendingFlow.currentCredentialIndex];
        const remaining = pendingFlow.missingCredentials.slice(pendingFlow.currentCredentialIndex);
        const remainingList = remaining.map(c => `**${c}**`).join(', ');
        
        const responseMessage = 
          `✅ Guardé tu **${currentCredential}**.\n\n` +
          `Ahora necesito: ${remainingList}\n\n` +
          `💡 **¿Puedes compartir tu ${nextCredential}?** (Se guardará encriptado de forma segura)`;
        
        // Update flow state (keep it active)
        this.pendingCredentialFlows.set(userId, pendingFlow);
        
        // Save assistant message
        this.conversationStore.saveMessage({
          userId,
          role: 'assistant',
          content: responseMessage,
          timestamp: Date.now()
        });
        
        logger.info('Requesting next credential in flow', {
          userId,
          skillName: pendingFlow.skillName,
          nextCredential,
          remainingCount: remaining.length
        });
        
        return responseMessage;
      } else {
        // All credentials saved - clear flow state
        this.pendingCredentialFlows.delete(userId);
        
        const confirmationMessage = 
          `✅ Perfecto, guardé tu **${currentCredential}**.\n\n` +
          `🎉 Ahora tengo todas las credenciales necesarias para usar **${pendingFlow.skillName}**.\n\n` +
          `¿Qué te gustaría hacer?`;
        
        // Save assistant message
        this.conversationStore.saveMessage({
          userId,
          role: 'assistant',
          content: confirmationMessage,
          timestamp: Date.now()
        });
        
        logger.info('Credential flow completed', {
          userId,
          skillName: pendingFlow.skillName,
          totalCredentialsSaved: pendingFlow.missingCredentials.length
        });
        
        return confirmationMessage;
      }
    } catch (error) {
      logger.error('Failed to save pending credential', {
        userId,
        skillName: pendingFlow.skillName,
        credentialName: currentCredential,
        error: String(error)
      });
      
      const errorMessage = 
        `❌ Hubo un error al guardar tu **${currentCredential}**. ` +
        `Por favor intenta enviarlo de nuevo.`;
      
      // Save both messages
      this.conversationStore.saveMessage({
        userId,
        role: 'user',
        content: text,
        timestamp
      });
      
      this.conversationStore.saveMessage({
        userId,
        role: 'assistant',
        content: errorMessage,
        timestamp: Date.now()
      });
      
      return errorMessage;
    }
  }

  /**
   * Detect if we're in the middle of a credential collection flow
   * Returns the skill name if credential flow is active, null otherwise
   * 
   * Generic approach: Extract credential name from assistant's last message,
   * then find which skill requires that credential by checking all available skills
   */
  private async detectActiveCredentialFlow(history: any[]): Promise<string | null> {
    if (history.length === 0) return null;
    
    // Get last assistant message
    const lastAssistantMessage = [...history]
      .reverse()
      .find((m: any) => m.role === 'assistant');
    
    if (!lastAssistantMessage) return null;
    
    const content = lastAssistantMessage.content?.toLowerCase() || '';
    
    // Check if asking for credential
    const asksForCredential = 
      content.includes('compartir') ||
      content.includes('credential') ||
      content.includes('token') ||
      content.includes('guardará encriptado');
    
    if (!asksForCredential) return null;
    
    // Extract credential name from message: "¿Puedes compartir tu GOOGLE_CLIENT_ID?" or "Ahora necesito: GOOGLE_CLIENT_SECRET"
    const credentialPattern = /(?:compartir tu|necesito:?\s*[\*\*]?)([A-Z][A-Z0-9_]+)/;
    const match = lastAssistantMessage.content.match(credentialPattern);
    
    if (!match || !match[1]) {
      logger.debug('Could not extract credential name from assistant message', {
        messagePreview: content.substring(0, 100)
      });
      return null;
    }
    
    const requestedCredential = match[1];
    
    // Find which skill requires this credential by checking all available skills
    try {
      const allSkills = await this.skillStore.listAvailableSkills();
      
      for (const skillMetadata of allSkills) {
        if (skillMetadata.requiredEnv && skillMetadata.requiredEnv.includes(requestedCredential)) {
          logger.info('Detected active credential flow', {
            skillName: skillMetadata.name,
            requestedCredential,
            source: 'generic-detection'
          });
          return skillMetadata.name;
        }
      }
      
      logger.debug('No skill found requiring credential', {
        requestedCredential,
        checkedSkills: allSkills.length
      });
    } catch (error) {
      logger.warn('Failed to detect credential flow from skills', {
        error: String(error),
        requestedCredential
      });
    }
    
    return null;
  }

  private isResponseToCredentialRequest(history: any[], currentMessage: string): boolean {
    return this.extractCredentialFromMessage(history, currentMessage) !== null;
  }

  /**
   * Get image MIME type (centralized, Fase 8)
   */
  private getImageMimeType(filePath: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
    return detectImageMimeType(filePath);
  }

  /**
   * Send autonomous notification to user (Fase 10)
   * Called by AutonomousEngine when it generates proactive messages
   */
  private async sendAutonomousNotification(userId: string, message: string): Promise<void> {
    try {
      // TODO: Integrar con Telegram en futuras fases
      // Por ahora solo se loggea
      logger.info('Autonomous notification generated', {
        userId,
        messageLength: message.length,
        preview: message.substring(0, 100)
      });
    } catch (error) {
      logger.error('Failed to send autonomous notification', { userId, error });
    }
  }

  /**
   * Initialize autonomous loop for a user (Fase 10)
   * Called when user connects
   */
  async initializeAutonomousMode(userId: string): Promise<void> {
    try {
      await this.autonomousEngine.startAutonomousLoop(userId);
      logger.info('Autonomous mode initialized for user', { userId });
    } catch (error) {
      logger.error('Failed to initialize autonomous mode', { userId, error });
    }
  }

  /**
   * Start the autonomous task daemon (PASO 11)
   */
  async startTaskDaemon(): Promise<void> {
    try {
      await this.autonomousDaemon.start();
      logger.info('Task daemon started');
    } catch (error) {
      logger.error('Failed to start task daemon', { error });
    }
  }

  /**
   * Stop the autonomous task daemon (PASO 11)
   */
  async stopTaskDaemon(): Promise<void> {
    try {
      await this.autonomousDaemon.stop();
      logger.info('Task daemon stopped');
    } catch (error) {
      logger.error('Failed to stop task daemon', { error });
    }
  }

  /**
   * Get current task daemon status (PASO 11)
   */
  getTaskDaemonStatus() {
    return this.autonomousDaemon.getStatus();
  }

  /**
   * Get access to task queue store for enqueueing/managing tasks (PASO 11)
   */
  getTaskQueue() {
    return this.taskQueueStore;
  }

  /**
   * Get access to project state tracker (PASO 11)
   */
  getProjectTracker() {
    return this.projectStateTracker;
  }

  /**
   * Get access to backup manager for data persistence (PASO 11)
   */
  getBackupManager() {
    return this.backupManager;
  }

  /**
   * Stop autonomous loop for a user
   */
  async stopAutonomousMode(userId: string): Promise<void> {
    try {
      await this.autonomousEngine.stopAutonomousLoop(userId);
      logger.info('Autonomous mode stopped for user', { userId });
    } catch (error) {
      logger.error('Failed to stop autonomous mode', { userId, error });
    }
  }

  /**
   * Record user feedback on an autonomous action (Fase 10)
   */
  async recordAutonomousFeedback(
    userId: string,
    actionId: string,
    feedback: 'useful' | 'not_useful' | 'execute' | 'cancel'
  ): Promise<void> {
    await this.autonomousEngine.recordUserFeedback(userId, actionId, feedback);
  }
}
