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
import { LLMMessage } from '../config/types.js';
import { logger } from '../utils/logger.js';

export interface BrainConfig {
  conversationProvider: LLMProvider;
  reasoningProvider: LLMProvider;
  analyzerProvider: LLMProvider;
}

export class Brain {
  private conversationProvider: LLMProvider;
  private reasoningProvider: LLMProvider;
  private intentAnalyzer: IntentAnalyzer;
  private memoryExtractor: MemoryExtractor;
  private prospectiveExtractor: ProspectiveMemoryExtractor;
  private prospectiveCommandAnalyzer: ProspectiveCommandAnalyzer;
  private conversationStore: ConversationStore;
  private profileStore: ProfileStore;
  private memoryStore: MemoryStore;
  private prospectiveStore: ProspectiveMemoryStore;
  private tokenTracker: TokenTracker;

  constructor(config: BrainConfig) {
    this.conversationProvider = config.conversationProvider;
    this.reasoningProvider = config.reasoningProvider;
    this.intentAnalyzer = new IntentAnalyzer(config.analyzerProvider);
    this.memoryExtractor = new MemoryExtractor(config.analyzerProvider);
    this.prospectiveExtractor = new ProspectiveMemoryExtractor(config.analyzerProvider);
    this.prospectiveCommandAnalyzer = new ProspectiveCommandAnalyzer();
    this.conversationStore = new ConversationStore();
    this.profileStore = new ProfileStore();
    this.memoryStore = new MemoryStore();
    this.prospectiveStore = new ProspectiveMemoryStore(this.conversationStore.getStore());
    this.tokenTracker = new TokenTracker();

    logger.info('Brain initialized', {
      conversation: this.conversationProvider.getName(),
      reasoning: this.reasoningProvider.getName()
    });
  }

  /**
   * Process a user message and generate a response
   */
  async processMessage(userId: string, text: string): Promise<string> {
    const timestamp = Date.now();

    try {
      // 1. Get conversation history
      const history = this.conversationStore.getHistory(userId, 40);

      // 2. Get user profile
      const profile = this.profileStore.getProfile(userId);

      // 3. Get memories (top 15 most important)
      const memories = this.memoryStore.getMemories(userId, 15);

      // 4. Get temporal/spatial context (Fase 3)
      const context = ContextProvider.getContext(profile);

      // 5. Get prospective memories (Fase 6)
      const prospectives = this.prospectiveStore.getPending(userId);

      // 6. Update prospective statuses based on current time
      await this.updateProspectiveStatuses(userId, prospectives);

      // 7. Check for prospective commands in conversation (Fase 6 enhancement)
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

      // 7. Analyze intent to decide which model to use
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

      // 8. Select provider based on intent
      const provider = intent.needsReasoning
        ? this.reasoningProvider
        : this.conversationProvider;

      logger.info('Provider selected', {
        provider: provider.getName(),
        model: provider.getModel(),
        reasoning: intent.reasoning
      });

      // 9. Build system prompt with memories, context, and prospectives
      const systemPrompt = SystemPromptBuilder.build(profile, memories, context, prospectives);

      // 10. Prepare messages for LLM
      const messages: LLMMessage[] = [
        ...history.map(h => ({
          role: h.role,
          content: h.content
        })),
        { role: 'user' as const, content: text }
      ];

      // 11. Generate response
      const response = await provider.generateContent(messages, systemPrompt);

      // 12. Save user message
      this.conversationStore.saveMessage({
        userId,
        role: 'user',
        content: text,
        timestamp
      });

      // 13. Save assistant response
      this.conversationStore.saveMessage({
        userId,
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
        modelUsed: provider.getName()
      });

      // 14. Extract and save new memories (retrospective)
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

      // 15. Extract and save new prospective memories (Fase 6)
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

      // 16. Detect prospective completions (Fase 6)
      await this.detectProspectiveCompletions(userId, text, response.content, prospectives);

      // 17. Track token usage
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
      if (prospectiveCommandMessage) {
        return `${prospectiveCommandMessage}\n\n${response.content}`;
      }

      return response.content;
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
}
