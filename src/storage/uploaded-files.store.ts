/**
 * UploadedFilesStore - Manages metadata for uploaded files (Fase 8)
 */

import { UploadedFile } from '../config/types.js';
import { JSONStore } from './json-store.js';
import { logger } from '../utils/logger.js';

export class UploadedFilesStore {
  private store: JSONStore;

  constructor(store: JSONStore) {
    this.store = store;
  }

  /**
   * Save uploaded file metadata
   */
  saveUpload(upload: UploadedFile): void {
    const data = this.store.read();
    if (!data.uploadedFiles) {
      data.uploadedFiles = [];
    }

    data.uploadedFiles.push({
      ...upload,
      uploadedAt: upload.uploadedAt.toISOString()
    });

    this.store.write(data);
    logger.debug('Upload saved to store', { id: upload.id, filename: upload.filename });
  }

  /**
   * Get recent uploads for a user
   */
  getRecentUploads(userId: string, limit: number = 10): UploadedFile[] {
    const data = this.store.read();
    const files = (data.uploadedFiles || [])
      .filter((f: any) => f.userId === userId)
      .map((f: any) => ({
        ...f,
        uploadedAt: new Date(f.uploadedAt)
      }))
      .sort((a: UploadedFile, b: UploadedFile) =>
        b.uploadedAt.getTime() - a.uploadedAt.getTime()
      )
      .slice(0, limit);

    return files;
  }

  /**
   * Get upload by ID
   */
  getUploadById(id: string): UploadedFile | null {
    const data = this.store.read();
    const file = (data.uploadedFiles || []).find((f: any) => f.id === id);

    if (!file) {
      return null;
    }

    return {
      ...file,
      uploadedAt: new Date(file.uploadedAt)
    };
  }

  /**
   * Get upload by path
   */
  getUploadByPath(path: string): UploadedFile | null {
    const data = this.store.read();
    const file = (data.uploadedFiles || []).find((f: any) => f.path === path);

    if (!file) {
      return null;
    }

    return {
      ...file,
      uploadedAt: new Date(file.uploadedAt)
    };
  }

  /**
   * Update upload metadata
   */
  updateUpload(id: string, updates: Partial<UploadedFile>): void {
    const data = this.store.read();
    const index = (data.uploadedFiles || []).findIndex((f: any) => f.id === id);

    if (index !== -1) {
      data.uploadedFiles![index] = {
        ...data.uploadedFiles![index],
        ...updates
      };

      this.store.write(data);
      logger.debug('Upload updated', { id });
    }
  }

  /**
   * Delete upload metadata
   */
  deleteUpload(id: string): void {
    const data = this.store.read();
    data.uploadedFiles = (data.uploadedFiles || []).filter((f: any) => f.id !== id);

    this.store.write(data);
    logger.debug('Upload deleted from store', { id });
  }

  /**
   * Cleanup old uploads (older than given date)
   */
  cleanupOldUploads(olderThan: Date): number {
    const data = this.store.read();
    const before = data.uploadedFiles?.length || 0;

    data.uploadedFiles = (data.uploadedFiles || []).filter((f: any) =>
      new Date(f.uploadedAt) >= olderThan
    );

    const after = data.uploadedFiles.length;
    this.store.write(data);

    const deleted = before - after;
    if (deleted > 0) {
      logger.info('Old uploads cleaned up', { deleted, before, after });
    }

    return deleted;
  }

  /**
   * Get total upload count for user
   */
  getUploadCount(userId: string): number {
    const data = this.store.read();
    return (data.uploadedFiles || []).filter((f: any) => f.userId === userId).length;
  }
}
