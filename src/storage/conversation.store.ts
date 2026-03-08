/**
 * Conversation History Store
 * Manages message history with a limit of 40 messages per user
 */

import { DB } from './db.js';
import { ConversationMessage } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';

export class ConversationStore {
  private store = DB.getInstance();
  private readonly MESSAGE_LIMIT = 40;

  /**
   * Save a message to the conversation history
   */
  saveMessage(message: ConversationMessage): void {
    try {
      const msg = {
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        modelUsed: message.modelUsed
      };

      this.store.addConversation(message.userId, msg);
    } catch (error) {
      logger.error('Failed to save message', error);
      throw new StorageError(`Failed to save message: ${error}`);
    }
  }

  /**
   * Get conversation history for a user (last N messages)
   */
  getHistory(userId: string, limit: number = this.MESSAGE_LIMIT): ConversationMessage[] {
    try {
      const messages = this.store.getConversations(userId);

      return messages.slice(-limit).map((msg: any, idx: number) => ({
        id: idx,
        userId,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        modelUsed: msg.modelUsed
      }));
    } catch (error) {
      logger.error('Failed to get conversation history', error);
      throw new StorageError(`Failed to get conversation history: ${error}`);
    }
  }

  /**
   * Clear all conversation history for a user
   */
  clearHistory(userId: string): void {
    try {
      this.store.clearConversations(userId);
      logger.info('Conversation history cleared', { userId });
    } catch (error) {
      logger.error('Failed to clear conversation history', error);
      throw new StorageError(`Failed to clear conversation history: ${error}`);
    }
  }

  /**
   * Get message count for a user
   */
  getMessageCount(userId: string): number {
    try {
      return this.store.getConversationCount(userId);
    } catch (error) {
      logger.error('Failed to get message count', error);
      throw new StorageError(`Failed to get message count: ${error}`);
    }
  }
}
