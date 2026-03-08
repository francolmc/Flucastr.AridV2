/**
 * Token Tracker
 * Tracks real token usage from LLM responses
 */

import { DB } from '../storage/db.js';
import { TokenStats } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';

export class TokenTracker {
  private store = DB.getInstance();

  /**
   * Track token usage for a message
   * IMPORTANT: usage must come from LLMResponse.usage, NOT estimations
   */
  track(
    userId: string,
    modelUsed: string,
    usage: { inputTokens: number; outputTokens: number }
  ): void {
    try {
      this.store.addTokenUsage(userId, {
        provider: modelUsed,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      });

      logger.debug('Token usage tracked', {
        userId,
        model: modelUsed,
        input: usage.inputTokens,
        output: usage.outputTokens
      });
    } catch (error) {
      logger.error('Failed to track token usage', error);
      throw new StorageError(`Failed to track token usage: ${error}`);
    }
  }

  /**
   * Get token usage statistics for a user
   */
  getStats(userId: string, days: number = 7): TokenStats[] {
    try {
      const stats = this.store.getTokenStats(userId, days);

      return stats.map(stat => ({
        userId,
        sessionDate: stat.sessionDate,
        provider: stat.provider,
        inputTokens: stat.inputTokens,
        outputTokens: stat.outputTokens,
        messageCount: stat.messageCount
      }));
    } catch (error) {
      logger.error('Failed to get token stats', error);
      throw new StorageError(`Failed to get token stats: ${error}`);
    }
  }

  /**
   * Get total token usage for a user (all time)
   */
  getTotalStats(userId: string): {
    totalInput: number;
    totalOutput: number;
    totalMessages: number;
    byProvider: Record<string, { input: number; output: number; messages: number }>;
  } {
    try {
      return this.store.getTotalTokenStats(userId);
    } catch (error) {
      logger.error('Failed to get total token stats', error);
      throw new StorageError(`Failed to get total token stats: ${error}`);
    }
  }
}
