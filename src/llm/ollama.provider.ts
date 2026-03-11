/**
 * Ollama Provider (Local LLM)
 */

import { LLMProvider } from './provider.interface.js';
import { LLMMessage, LLMResponse } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { LLMError } from '../utils/errors.js';
import { ToolDefinition } from '../hands/tool-definitions.js';

interface OllamaMessage {
  role: string;
  content: string;
}

interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl;
    this.model = model;
    logger.info('Ollama provider initialized', { baseUrl, model });
  }

  async generateContent(
    messages: LLMMessage[],
    systemPrompt?: string,
    tools?: ToolDefinition[]  // Not implemented for Ollama yet
  ): Promise<LLMResponse> {
    try {
      // Build messages array
      const ollamaMessages: OllamaMessage[] = [];

      // Add system message if provided
      if (systemPrompt) {
        ollamaMessages.push({
          role: 'system',
          content: systemPrompt
        });
      }

      // Add conversation messages (extract text from multimodal content)
      for (const msg of messages) {
        ollamaMessages.push({
          role: msg.role,
          content: this.extractTextFromContent(msg.content)
        });
      }

      // Call Ollama API
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: ollamaMessages,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as OllamaResponse;

      // Extract content
      const content = data.message.content;

      // Calculate token usage (Ollama provides counts)
      const inputTokens = data.prompt_eval_count || this.estimateTokens(
        ollamaMessages.map(m => m.content).join('\n')
      );
      const outputTokens = data.eval_count || this.estimateTokens(content);

      return {
        content,
        stopReason: this.mapDoneReason(data.done_reason),
        usage: {
          inputTokens,
          outputTokens
        }
      };
    } catch (error) {
      logger.error('Ollama API error', error);
      throw new LLMError(`Ollama API error: ${error}`, 'ollama');
    }
  }

  getName(): string {
    return 'ollama';
  }

  getModel(): string {
    return this.model;
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  private mapDoneReason(reason: string | undefined): 'end_turn' | 'max_tokens' | 'stop_sequence' {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'length':
        return 'max_tokens';
      default:
        return 'end_turn';
    }
  }

  /**
   * Extract text from content (multimodal support - Fase 8)
   * Note: Ollama may not support images yet, so we just extract text
   */
  private extractTextFromContent(content: string | any[]): string {
    if (typeof content === 'string') {
      return content;
    }

    // Extract text blocks from multimodal content
    return content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n') || '[Image content - not supported by Ollama]';
  }
}
