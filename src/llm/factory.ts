/**
 * LLM Provider Factory
 * Creates and manages LLM provider instances
 */

import { LLMProvider } from './provider.interface.js';
import { AnthropicProvider } from './anthropic.provider.js';
import { GeminiProvider } from './gemini.provider.js';
import { OllamaProvider } from './ollama.provider.js';
import { LLMConfig } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { LLMError } from '../utils/errors.js';

export interface ProviderSet {
  conversation: LLMProvider;
  reasoning: LLMProvider;
  analyzer: LLMProvider;  // For intent analysis (always cheap)
}

export class LLMFactory {
  private config: LLMConfig;
  private providers: Map<string, LLMProvider> = new Map();

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * Initialize providers based on configuration
   */
  initialize(): ProviderSet {
    logger.info('Initializing LLM providers', {
      mode: this.config.mode,
      conversation: this.config.providerConversation,
      reasoning: this.config.providerReasoning
    });

    if (this.config.mode === 'hybrid') {
      return this.initializeHybridMode();
    } else {
      return this.initializeSingleMode();
    }
  }

  /**
   * Initialize hybrid mode (different providers for conversation/reasoning)
   */
  private initializeHybridMode(): ProviderSet {
    const conversationProvider = this.getOrCreateProvider(this.config.providerConversation);
    const reasoningProvider = this.getOrCreateProvider(this.config.providerReasoning);
    const analyzerProvider = this.getOrCreateProvider(this.config.providerAnalyzer); // Configurable analyzer provider

    return {
      conversation: conversationProvider,
      reasoning: reasoningProvider,
      analyzer: analyzerProvider
    };
  }

  /**
   * Initialize single mode (same provider for everything)
   */
  private initializeSingleMode(): ProviderSet {
    const provider = this.getOrCreateProvider(this.config.providerConversation);

    return {
      conversation: provider,
      reasoning: provider,
      analyzer: provider
    };
  }

  /**
   * Get or create a provider instance
   */
  private getOrCreateProvider(name: string): LLMProvider {
    // Check if already created
    if (this.providers.has(name)) {
      return this.providers.get(name)!;
    }

    // Create new provider
    let provider: LLMProvider;

    switch (name.toLowerCase()) {
      case 'anthropic':
      case 'claude':
        provider = new AnthropicProvider(
          this.config.anthropic.apiKey,
          this.config.anthropic.model
        );
        break;

      case 'gemini':
      case 'google':
        provider = new GeminiProvider(
          this.config.gemini.apiKey,
          this.config.gemini.model
        );
        break;

      case 'ollama':
        provider = new OllamaProvider(
          this.config.ollama.baseUrl,
          this.config.ollama.model
        );
        break;

      default:
        throw new LLMError(`Unknown provider: ${name}`);
    }

    // Cache provider
    this.providers.set(name, provider);
    logger.info('Provider created', { name, model: provider.getModel() });

    return provider;
  }

  /**
   * Get a specific provider by name (for testing or advanced use)
   */
  getProvider(name: string): LLMProvider {
    return this.getOrCreateProvider(name);
  }
}
