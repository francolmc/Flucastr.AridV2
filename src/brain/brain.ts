/**
 * Brain - Core Orchestrator
 * Manages conversation flow and LLM interaction
 */

import { LLMProvider } from '../llm/provider.interface.js';
import { ConversationStore } from '../storage/conversation.store.js';
import { ProfileStore } from '../storage/profile.store.js';
import { TokenTracker } from './token-tracker.js';
import { SystemPromptBuilder } from './system-prompt.js';
import { IntentAnalyzer } from './intent-analyzer.js';
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
  private conversationStore: ConversationStore;
  private profileStore: ProfileStore;
  private tokenTracker: TokenTracker;

  constructor(config: BrainConfig) {
    this.conversationProvider = config.conversationProvider;
    this.reasoningProvider = config.reasoningProvider;
    this.intentAnalyzer = new IntentAnalyzer(config.analyzerProvider);
    this.conversationStore = new ConversationStore();
    this.profileStore = new ProfileStore();
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

      // 3. Analyze intent to decide which model to use
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

      // 4. Select provider based on intent
      const provider = intent.needsReasoning
        ? this.reasoningProvider
        : this.conversationProvider;

      logger.info('Provider selected', {
        provider: provider.getName(),
        model: provider.getModel(),
        reasoning: intent.reasoning
      });

      // 5. Build system prompt
      const systemPrompt = SystemPromptBuilder.build(profile);

      // 6. Prepare messages for LLM
      const messages: LLMMessage[] = [
        ...history.map(h => ({
          role: h.role,
          content: h.content
        })),
        { role: 'user' as const, content: text }
      ];

      // 7. Generate response
      const response = await provider.generateContent(messages, systemPrompt);

      // 8. Save user message
      this.conversationStore.saveMessage({
        userId,
        role: 'user',
        content: text,
        timestamp
      });

      // 9. Save assistant response
      this.conversationStore.saveMessage({
        userId,
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
        modelUsed: provider.getName()
      });

      // 10. Track token usage
      this.tokenTracker.track(userId, provider.getName(), response.usage);

      logger.info('Message processed', {
        userId,
        provider: provider.getName(),
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens
      });

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
}
