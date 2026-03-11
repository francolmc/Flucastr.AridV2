/**
 * LLM Provider Interface
 * Common contract for all LLM providers
 */

import { LLMMessage, LLMResponse } from '../config/types.js';
import { ToolDefinition } from '../hands/tool-definitions.js';

export interface LLMProvider {
  /**
   * Generate content from messages with optional system prompt and tools
   */
  generateContent(
    messages: LLMMessage[],
    systemPrompt?: string,
    tools?: ToolDefinition[]
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
