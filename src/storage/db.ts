/**
 * Storage Layer (JSON-based for development)
 * No external database dependencies
 */

import { JSONStore } from './json-store.js';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';
import { dirname } from 'path';

export class DB {
  private static instance: JSONStore | null = null;

  static async initialize(storePath: string): Promise<JSONStore> {
    if (this.instance) {
      return this.instance;
    }

    try {
      // Create store instance
      const storagePath = dirname(storePath);
      this.instance = new JSONStore(storagePath);

      // Initialize store
      await this.instance.initialize();

      logger.info('Store initialized', { path: storePath });
      return this.instance;
    } catch (error) {
      logger.error('Failed to initialize store', error);
      throw new StorageError(`Failed to initialize store: ${error}`);
    }
  }

  static getInstance(): JSONStore {
    if (!this.instance) {
      throw new StorageError('Store not initialized. Call DB.initialize() first.');
    }
    return this.instance;
  }

  static async close() {
    if (this.instance) {
      await this.instance.flushToDisk();
      this.instance = null;
      logger.info('Store connection closed');
    }
  }
}
