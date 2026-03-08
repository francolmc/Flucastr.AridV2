/**
 * Google Gemini Provider
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMProvider } from './provider.interface.js';
import { LLMMessage, LLMResponse } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { LLMError } from '../utils/errors.js';

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
    systemPrompt?: string
  ): Promise<LLMResponse> {
    try {
      const model = this.client.getGenerativeModel({
        model: this.model,
        systemInstruction: systemPrompt
      });

      // Convert messages to Gemini format
      const history = messages.slice(0, -1).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const lastMessage = messages[messages.length - 1];

      // Start chat session
      const chat = model.startChat({ history });

      // Send message
      const result = await chat.sendMessage(lastMessage.content);
      const response = result.response;

      // Extract text
      const content = response.text();

      // Estimate tokens (Gemini doesn't provide exact token counts in all cases)
      const inputTokens = this.estimateTokens(
        messages.map(m => m.content).join('\n') + (systemPrompt || '')
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
}
