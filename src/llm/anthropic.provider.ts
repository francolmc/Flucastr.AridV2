/**
 * Anthropic (Claude) Provider with Prompt Caching
 */

import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider } from './provider.interface.js';
import { LLMMessage, LLMResponse } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { LLMError } from '../utils/errors.js';
import { ToolDefinition } from '../hands/tool-definitions.js';

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
    systemPrompt?: string,
    tools?: ToolDefinition[]
  ): Promise<LLMResponse> {
    try {
      // Format messages for Anthropic API (with multimodal support)
      const anthropicMessages = messages.map(msg => {
        // Backward compatible: if content is string, keep as is
        if (typeof msg.content === 'string') {
          return {
            role: msg.role,
            content: msg.content
          };
        }

        // Multimodal: process content blocks
        const content = msg.content.map(block => {
          if (block.type === 'text') {
            return {
              type: 'text' as const,
              text: block.text
            };
          }
          if (block.type === 'image') {
            return {
              type: 'image' as const,
              source: block.source
            };
          }
          return block;
        });

        return {
          role: msg.role,
          content
        };
      });

      // Build system configuration with prompt caching
      const systemConfig: Anthropic.Messages.MessageCreateParams['system'] = systemPrompt
        ? [{
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const }  // Enable prompt caching
          }]
        : undefined;

      // Prepare request params
      const requestParams: Anthropic.Messages.MessageCreateParams = {
        model: this.model,
        max_tokens: 8192,
        system: systemConfig,
        messages: anthropicMessages
      };

      // Add tools if provided
      if (tools && tools.length > 0) {
        requestParams.tools = tools as any;
      }

      const response = await this.client.messages.create(requestParams);

      // Extract text content
      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as any).text)
        .join('\n');

      // Extract tool use blocks
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
      
      const toolCalls = toolUseBlocks.length > 0 
        ? toolUseBlocks.map((block: any) => ({
            id: block.id,
            name: block.name,
            input: block.input
          }))
        : undefined;

      // Determine stop reason
      let stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' = 'end_turn';
      if (response.stop_reason === 'tool_use') {
        stopReason = 'tool_use';
      } else if (response.stop_reason === 'max_tokens') {
        stopReason = 'max_tokens';
      } else if (response.stop_reason === 'stop_sequence') {
        stopReason = 'stop_sequence';
      }

      return {
        content: textContent,
        stopReason,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        },
        toolCalls
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
