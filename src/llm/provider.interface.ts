/**
 * LLM Provider Interface
 * Common contract for all LLM providers
 */

import { LLMMessage, LLMResponse } from '../config/types.js';

export interface LLMProvider {
  /**
   * Generate content from messages with optional system prompt
   */
  generateContent(
    messages: LLMMessage[],
    systemPrompt?: string
  ): Promise<LLMResponse>;

  /**
   * Get provider name
   */
  getName(): string;

  /**
   * Get current model
   */
  getModel(): string;
}
