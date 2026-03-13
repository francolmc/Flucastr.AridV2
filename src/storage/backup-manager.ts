/**
 * Backup Manager
 * Handles backup and restore operations for data persistence
 * PASO 11: Production System - Backups
 */

import { readFile, writeFile, readdir, rm } from 'fs/promises';
import { statSync } from 'fs';
import { join, basename } from 'path';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';

export interface BackupInfo {
  filename: string;
  path: string;
  createdAt: Date;
  size: number; // bytes
}

export interface BackupStats {
  totalBackups: number;
  totalSize: number; // bytes
  oldestBackup?: BackupInfo;
  newestBackup?: BackupInfo;
}

export class BackupManager {
  private backupDir: string;
  private storeFilePath: string;

  constructor(backupDir: string, storeFilePath: string) {
    this.backupDir = backupDir;
    this.storeFilePath = storeFilePath;
  }

  /**
   * Create a backup of the current store
   */
  async createBackup(): Promise<BackupInfo> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const backupFilename = `store-${timestamp}.json`;
      const backupPath = join(this.backupDir, backupFilename);

      // Read current store
      const storeContent = await readFile(this.storeFilePath, 'utf-8');

      // Write backup
      await writeFile(backupPath, storeContent, 'utf-8');

      const stat = statSync(backupPath);
      const backupInfo: BackupInfo = {
        filename: backupFilename,
        path: backupPath,
        createdAt: new Date(),
        size: stat.size
      };

      logger.info('Backup created', {
        filename: backupFilename,
        size: stat.size
      });

      // Prune old backups
      await this.pruneOldBackups(7);

      return backupInfo;
    } catch (error) {
      logger.error('Failed to create backup', error);
      throw new StorageError(`Failed to create backup: ${error}`);
    }
  }

  /**
   * List all available backups
   */
  async listBackups(): Promise<BackupInfo[]> {
    try {
      const files = await readdir(this.backupDir);
      const backups: BackupInfo[] = [];

      for (const file of files) {
        if (!file.startsWith('store-') || !file.endsWith('.json')) {
          continue;
        }

        const path = join(this.backupDir, file);
        const stat = statSync(path);

        backups.push({
          filename: file,
          path,
          createdAt: stat.mtime,
          size: stat.size
        });
      }

      // Sort by creation date (newest first)
      backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return backups;
    } catch (error) {
      logger.error('Failed to list backups', error);
      throw new StorageError(`Failed to list backups: ${error}`);
    }
  }

  /**
   * Restore from a specific backup
   */
  async restoreBackup(backupFilename: string): Promise<void> {
    try {
      const backupPath = join(this.backupDir, backupFilename);

      // Verify backup exists
      const backups = await this.listBackups();
      const backup = backups.find(b => b.filename === backupFilename);

      if (!backup) {
        throw new Error(`Backup not found: ${backupFilename}`);
      }

      // Read backup
      const backupContent = await readFile(backupPath, 'utf-8');

      // Override current store with backup
      await writeFile(this.storeFilePath, backupContent, 'utf-8');

      logger.info('Backup restored', { filename: backupFilename });
    } catch (error) {
      logger.error('Failed to restore backup', error);
      throw new StorageError(`Failed to restore backup: ${error}`);
    }
  }

  /**
   * Prune old backups, keep only recent ones
   */
  async pruneOldBackups(keepLast: number): Promise<void> {
    try {
      const backups = await this.listBackups();

      if (backups.length <= keepLast) {
        return;
      }

      const toDelete = backups.slice(keepLast);

      for (const backup of toDelete) {
        await rm(backup.path, { force: true });
        logger.debug('Pruned backup', { filename: backup.filename });
      }

      logger.info('Backups pruned', {
        deleted: toDelete.length,
        remaining: keepLast
      });
    } catch (error) {
      logger.error('Failed to prune backups', error);
      throw new StorageError(`Failed to prune backups: ${error}`);
    }
  }

  /**
   * Get backup statistics
   */
  async getBackupStats(): Promise<BackupStats> {
    try {
      const backups = await this.listBackups();
      const totalSize = backups.reduce((sum, b) => sum + b.size, 0);

      return {
        totalBackups: backups.length,
        totalSize,
        newestBackup: backups[0],
        oldestBackup: backups[backups.length - 1]
      };
    } catch (error) {
      logger.error('Failed to get backup stats', error);
      throw new StorageError(`Failed to get backup stats: ${error}`);
    }
  }

  /**
   * Format size in human-readable format
   */
  static formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
