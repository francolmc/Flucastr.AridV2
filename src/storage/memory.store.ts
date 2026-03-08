/**
 * MemoryStore - Manages user memories (facts, preferences, projects, context)
 * Enables dynamic learning and personalization over time
 */

import { randomUUID } from 'crypto';
import { DB } from './db.js';
import { Memory, MemoryCategory } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';

export class MemoryStore {
  /**
   * Save a new memory
   */
  saveMemory(memory: Omit<Memory, 'id' | 'createdAt'>): Memory {
    try {
      const store = DB.getInstance();
      const newMemory: Memory = {
        id: randomUUID(),
        createdAt: new Date(),
        ...memory
      };

      store.addMemory(memory.userId, newMemory);

      logger.debug('Memory saved', {
        userId: memory.userId,
        category: memory.category,
        importance: memory.importance
      });

      return newMemory;
    } catch (error) {
      logger.error('Failed to save memory', error);
      throw new StorageError(`Failed to save memory: ${error}`);
    }
  }

  /**
   * Get memories for a user, sorted by importance (descending)
   * @param limit - Maximum number of memories to return (default: all)
   */
  getMemories(userId: string, limit?: number): Memory[] {
    try {
      const store = DB.getInstance();
      const memories = store.getMemories(userId) || [];

      // Validate memories array
      if (!Array.isArray(memories)) {
        logger.warn('Invalid memories data, returning empty array', { userId });
        return [];
      }

      // Sort by importance (highest first)
      const sorted = memories.sort((a: Memory, b: Memory) => b.importance - a.importance);

      // Apply limit if specified
      return limit ? sorted.slice(0, limit) : sorted;
    } catch (error) {
      logger.error('Failed to get memories', error);
      // Return empty array instead of throwing to prevent crashes
      return [];
    }
  }

  /**
   * Get memories filtered by category
   */
  getMemoriesByCategory(userId: string, category: MemoryCategory): Memory[] {
    try {
      const memories = this.getMemories(userId);
      return memories.filter((m: Memory) => m.category === category);
    } catch (error) {
      logger.error('Failed to get memories by category', error);
      // Return empty array instead of throwing
      return [];
    }
  }

  /**
   * Mark a memory as accessed (updates lastAccessed and increments accessCount)
   */
  markAccessed(memoryId: string, userId: string): void {
    try {
      const store = DB.getInstance();
      const memories = store.getMemories(userId);
      const memory = memories.find((m: Memory) => m.id === memoryId);

      if (memory) {
        const updates = {
          lastAccessed: new Date(),
          accessCount: (memory.accessCount || 0) + 1
        };

        store.updateMemory(userId, memoryId, updates);

        logger.debug('Memory marked as accessed', {
          memoryId,
          accessCount: updates.accessCount
        });
      }
    } catch (error) {
      logger.error('Failed to mark memory as accessed', error);
      throw new StorageError(`Failed to mark memory as accessed: ${error}`);
    }
  }

  /**
   * Update the importance score of a memory
   */
  updateImportance(memoryId: string, userId: string, importance: number): void {
    try {
      const store = DB.getInstance();

      // Validate importance range
      if (importance < 0 || importance > 1) {
        throw new Error('Importance must be between 0 and 1');
      }

      store.updateMemory(userId, memoryId, { importance });

      logger.debug('Memory importance updated', {
        memoryId,
        importance
      });
    } catch (error) {
      logger.error('Failed to update memory importance', error);
      throw new StorageError(`Failed to update memory importance: ${error}`);
    }
  }

  /**
   * Delete a memory
   */
  deleteMemory(memoryId: string, userId: string): void {
    try {
      const store = DB.getInstance();
      store.deleteMemory(userId, memoryId);

      logger.info('Memory deleted', { memoryId, userId });
    } catch (error) {
      logger.error('Failed to delete memory', error);
      throw new StorageError(`Failed to delete memory: ${error}`);
    }
  }

  /**
   * Search memories by content (simple string matching)
   */
  searchMemories(userId: string, query: string): Memory[] {
    try {
      const memories = this.getMemories(userId);
      const lowerQuery = query.toLowerCase();

      return memories.filter((m: Memory) =>
        m.content.toLowerCase().includes(lowerQuery)
      );
    } catch (error) {
      logger.error('Failed to search memories', error);
      // Return empty array instead of throwing
      return [];
    }
  }

  /**
   * Get total count of memories for a user
   */
  getCount(userId: string): number {
    try {
      const store = DB.getInstance();
      const memories = store.getMemories(userId) || [];

      if (!Array.isArray(memories)) {
        return 0;
      }

      return memories.length;
    } catch (error) {
      logger.error('Failed to get memory count', error);
      return 0;
    }
  }
}
