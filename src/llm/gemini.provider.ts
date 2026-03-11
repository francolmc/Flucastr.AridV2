/**
 * Google Gemini Provider
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMProvider } from './provider.interface.js';
import { LLMMessage, LLMResponse } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { LLMError } from '../utils/errors.js';
import { ToolDefinition } from '../hands/tool-definitions.js';

export class GeminiProvider implements LLMProvider {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    if (!apiKey) {
      throw new LLMError('Gemini API key is required', 'gemini');
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
    logger.info('Gemini provider initialized', { model });
  }

  async generateContent(
    messages: LLMMessage[],
    systemPrompt?: string,
    tools?: ToolDefinition[]  // Not implemented for Gemini yet
  ): Promise<LLMResponse> {
    try {
      const model = this.client.getGenerativeModel({
        model: this.model,
        systemInstruction: systemPrompt
      });

      // Convert messages to Gemini format (with multimodal support)
      const history = messages.slice(0, -1).map(msg => {
        const parts = this.convertContentToParts(msg.content);
        return {
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts
        };
      });

      const lastMessage = messages[messages.length - 1];
      const lastMessageParts = this.convertContentToParts(lastMessage.content);

      // Start chat session
      const chat = model.startChat({ history });

      // Send message (can be multimodal)
      const result = await chat.sendMessage(lastMessageParts);
      const response = result.response;

      // Extract text
      const content = response.text();

      // Estimate tokens (Gemini doesn't provide exact token counts in all cases)
      const inputTokens = this.estimateTokens(
        messages.map(m => this.extractTextFromContent(m.content)).join('\n') + (systemPrompt || '')
      );
      const outputTokens = this.estimateTokens(content);

      return {
        content,
        stopReason: this.mapFinishReason(response.candidates?.[0]?.finishReason),
        usage: {
          inputTokens,
          outputTokens
        }
      };
    } catch (error) {
      logger.error('Gemini API error', error);
      throw new LLMError(`Gemini API error: ${error}`, 'gemini');
    }
  }

  getName(): string {
    return 'gemini';
  }

  getModel(): string {
    return this.model;
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  private mapFinishReason(reason: string | undefined): 'end_turn' | 'max_tokens' | 'stop_sequence' {
    switch (reason) {
      case 'STOP':
        return 'end_turn';
      case 'MAX_TOKENS':
        return 'max_tokens';
      case 'SAFETY':
      case 'RECITATION':
        return 'stop_sequence';
      default:
        return 'end_turn';
    }
  }

  /**
   * Convert LLMMessage content to Gemini parts format (multimodal support)
   */
  private convertContentToParts(content: string | any[]): any[] {
    // Backward compatible: if string, return text part
    if (typeof content === 'string') {
      return [{ text: content }];
    }

    // Multimodal: process content blocks
    return content.map(block => {
      if (block.type === 'text') {
        return { text: block.text };
      }
      if (block.type === 'image' && block.source.type === 'base64') {
        return {
          inlineData: {
            mimeType: block.source.media_type,
            data: block.source.data
          }
        };
      }
      // Fallback
      return { text: '[Unsupported content block]' };
    });
  }

  /**
   * Extract text from content (for token estimation)
   */
  private extractTextFromContent(content: string | any[]): string {
    if (typeof content === 'string') {
      return content;
    }

    return content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
  }
}
