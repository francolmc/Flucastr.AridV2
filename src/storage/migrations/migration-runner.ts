/**
 * Migration Runner
 * Handles database schema migrations
 * PASO 11: Production System - Migrations
 */

import { readFile, writeFile } from 'fs/promises';
import { logger } from '../../utils/logger.js';
import { StorageError } from '../../utils/errors.js';

export interface Migration {
  version: number;
  name: string;
  up: (data: any) => Promise<any>;
}

export class MigrationRunner {
  private storeFilePath: string;
  private migrations: Migration[] = [];

  constructor(storeFilePath: string) {
    this.storeFilePath = storeFilePath;
    this.registerMigrations();
  }

  /**
   * Register all available migrations
   */
  private registerMigrations(): void {
    // Migration 1: Add version field
    this.migrations.push({
      version: 1,
      name: 'Add version field',
      up: async (data) => {
        if (!data._version) {
          data._version = 1;
        }
        return data;
      }
    });

    // Add more migrations here as needed
  }

  /**
   * Get current schema version from store
   */
  private async getCurrentVersion(): Promise<number> {
    try {
      const content = await readFile(this.storeFilePath, 'utf-8');
      const data = JSON.parse(content);
      return data._version || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Run all pending migrations
   */
  async runPendingMigrations(): Promise<void> {
    try {
      const currentVersion = await this.getCurrentVersion();
      const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);

      if (pendingMigrations.length === 0) {
        logger.debug('No pending migrations');
        return;
      }

      logger.info('Running pending migrations', {
        fromVersion: currentVersion,
        count: pendingMigrations.length
      });

      let data: any;
      const content = await readFile(this.storeFilePath, 'utf-8');
      data = JSON.parse(content);

      for (const migration of pendingMigrations) {
        try {
          logger.info(`Executing migration ${migration.version}: ${migration.name}`);
          data = await migration.up(data);
          data._version = migration.version;

          // Write after each migration for safety
          await writeFile(this.storeFilePath, JSON.stringify(data, null, 2), 'utf-8');

          logger.info(`Migration ${migration.version} completed`);
        } catch (error) {
          logger.error(`Migration ${migration.version} failed`, error);
          throw new StorageError(
            `Migration ${migration.version} (${migration.name}) failed: ${error}`
          );
        }
      }

      logger.info('All migrations completed', {
        toVersion: data._version
      });
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      logger.error('Failed to run migrations', error);
      throw new StorageError(`Failed to run migrations: ${error}`);
    }
  }

  /**
   * Get migration info
   */
  getMigrationInfo(): string {
    const currentVersion = 0; // Will be updated async
    let message = '📦 **Migraciones de Datos**\n\n';
    message += `**Total disponibles:** ${this.migrations.length}\n`;
    message += `**Versión actual:** ${currentVersion}\n\n`;

    message += '**Historial:**\n';
    this.migrations.forEach(m => {
      message += `• v${m.version}: ${m.name}\n`;
    });

    return message;
  }
}
