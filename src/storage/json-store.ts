/**
 * Simple JSON-based Store (no database dependencies)
 * Lightweight persistence for development/testing
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';

interface StoreData {
  conversations: Record<string, any[]>;
  profiles: Record<string, any>;
  onboarding: Record<string, any>;
  tokens: Record<string, any[]>;
}

export class JSONStore {
  private data: StoreData = {
    conversations: {},
    profiles: {},
    onboarding: {},
    tokens: {}
  };
  private filePath: string;
  private initialized = false;

  constructor(storagePath: string) {
    this.filePath = join(storagePath, 'store.json');
  }

  async initialize(): Promise<void> {
    try {
      await mkdir(dirname(this.filePath), { recursive: true });

      // Try to load existing data
      try {
        const content = await readFile(this.filePath, 'utf-8');
        this.data = JSON.parse(content);
        logger.info('Store loaded from file', { path: this.filePath });
      } catch {
        // File doesn't exist, use default empty data
        logger.info('New store created', { path: this.filePath });
      }

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize store', error);
      throw new StorageError(`Failed to initialize store: ${error}`);
    }
  }

  private async save(): Promise<void> {
    try {
      await writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      logger.error('Failed to save store', error);
      throw new StorageError(`Failed to save store: ${error}`);
    }
  }

  // Conversation methods
  addConversation(userId: string, message: any): void {
    if (!this.data.conversations[userId]) {
      this.data.conversations[userId] = [];
    }

    this.data.conversations[userId].push(message);

    // Enforce limit of 40 messages
    if (this.data.conversations[userId].length > 40) {
      this.data.conversations[userId] = this.data.conversations[userId].slice(-40);
    }

    this.saveSync();
  }

  getConversations(userId: string): any[] {
    return this.data.conversations[userId] || [];
  }

  clearConversations(userId: string): void {
    this.data.conversations[userId] = [];
    this.saveSync();
  }

  getConversationCount(userId: string): number {
    return this.data.conversations[userId]?.length || 0;
  }

  // Profile methods
  getProfile(userId: string): any {
    if (!this.data.profiles[userId]) {
      this.data.profiles[userId] = {
        userId,
        agentName: 'Arid',
        agentTone: 'casual',
        userName: undefined,
        preferences: undefined
      };
      this.saveSync();
    }
    return this.data.profiles[userId];
  }

  updateProfile(userId: string, updates: any): void {
    if (!this.data.profiles[userId]) {
      this.data.profiles[userId] = {
        userId,
        agentName: 'Arid',
        agentTone: 'casual'
      };
    }

    this.data.profiles[userId] = {
      ...this.data.profiles[userId],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.saveSync();
  }

  // Onboarding methods
  getOnboarding(userId: string): any {
    return this.data.onboarding[userId] || null;
  }

  initializeOnboarding(userId: string): void {
    if (!this.data.onboarding[userId]) {
      this.data.onboarding[userId] = {
        userId,
        isCompleted: false,
        currentStep: 0,
        startedAt: new Date().toISOString()
      };
      this.saveSync();
    }
  }

  updateOnboarding(userId: string, updates: any): void {
    if (!this.data.onboarding[userId]) {
      this.initializeOnboarding(userId);
    }

    this.data.onboarding[userId] = {
      ...this.data.onboarding[userId],
      ...updates
    };

    this.saveSync();
  }

  markOnboardingComplete(userId: string): void {
    this.updateOnboarding(userId, {
      isCompleted: true,
      completedAt: new Date().toISOString()
    });
  }

  isOnboardingComplete(userId: string): boolean {
    const state = this.data.onboarding[userId];
    return state?.isCompleted || false;
  }

  // Token tracking methods
  addTokenUsage(userId: string, usage: any): void {
    if (!this.data.tokens[userId]) {
      this.data.tokens[userId] = [];
    }

    const date = new Date().toISOString().split('T')[0];
    const existing = this.data.tokens[userId].find(
      t => t.sessionDate === date && t.provider === usage.provider
    );

    if (existing) {
      existing.inputTokens += usage.inputTokens;
      existing.outputTokens += usage.outputTokens;
      existing.messageCount += 1;
    } else {
      this.data.tokens[userId].push({
        sessionDate: date,
        provider: usage.provider,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        messageCount: 1,
        createdAt: new Date().toISOString()
      });
    }

    this.saveSync();
  }

  getTokenStats(userId: string, days: number = 7): any[] {
    const tokens = this.data.tokens[userId] || [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return tokens.filter(t => new Date(t.sessionDate) >= cutoffDate);
  }

  getTotalTokenStats(userId: string): any {
    const tokens = this.data.tokens[userId] || [];

    let totalInput = 0;
    let totalOutput = 0;
    let totalMessages = 0;
    const byProvider: Record<string, any> = {};

    for (const t of tokens) {
      totalInput += t.inputTokens;
      totalOutput += t.outputTokens;
      totalMessages += t.messageCount;

      if (!byProvider[t.provider]) {
        byProvider[t.provider] = { input: 0, output: 0, messages: 0 };
      }
      byProvider[t.provider].input += t.inputTokens;
      byProvider[t.provider].output += t.outputTokens;
      byProvider[t.provider].messages += t.messageCount;
    }

    return {
      totalInput,
      totalOutput,
      totalMessages,
      byProvider
    };
  }

  // Utility methods
  private saveSync(): void {
    // Save immediately (synchronous write for simplicity)
    // In production, you'd want to batch these writes
    if (this.initialized) {
      try {
        writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
        logger.debug('Store saved to disk', { size: JSON.stringify(this.data).length });
      } catch (error) {
        logger.error('Failed to save store synchronously', error);
      }
    }
  }

  async flushToDisk(): Promise<void> {
    if (this.initialized) {
      await this.save();
    }
  }
}

// Helper import
import { dirname } from 'path';
