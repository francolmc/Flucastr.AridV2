/**
 * Anthropic (Claude) Provider with Prompt Caching
 */

import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider } from './provider.interface.js';
import { LLMMessage, LLMResponse } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { LLMError } from '../utils/errors.js';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    if (!apiKey) {
      throw new LLMError('Anthropic API key is required', 'anthropic');
    }
    this.client = new Anthropic({ apiKey });
    this.model = model;
    logger.info('Anthropic provider initialized', { model });
  }

  async generateContent(
    messages: LLMMessage[],
    systemPrompt?: string
  ): Promise<LLMResponse> {
    try {
      // Format messages for Anthropic API
      const anthropicMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Build system configuration with prompt caching
      const systemConfig: Anthropic.Messages.MessageCreateParams['system'] = systemPrompt
        ? [{
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const }  // Enable prompt caching
          }]
        : undefined;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8192,
        system: systemConfig,
        messages: anthropicMessages
      });

      // Extract text content
      const content = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as any).text)
        .join('\n');

      return {
        content,
        stopReason: this.mapStopReason(response.stop_reason),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        }
      };
    } catch (error) {
      logger.error('Anthropic API error', error);
      throw new LLMError(`Anthropic API error: ${error}`, 'anthropic');
    }
  }

  getName(): string {
    return 'anthropic';
  }

  getModel(): string {
    return this.model;
  }

  private mapStopReason(reason: string | null): 'end_turn' | 'max_tokens' | 'stop_sequence' {
    switch (reason) {
      case 'end_turn':
        return 'end_turn';
      case 'max_tokens':
        return 'max_tokens';
      case 'stop_sequence':
        return 'stop_sequence';
      default:
        return 'end_turn';
    }
  }
}
