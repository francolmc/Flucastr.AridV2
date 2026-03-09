/**
 * FileUploadManager - Handles downloading and storing files from Telegram (Fase 8)
 */

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Telegram } from 'telegraf';
import { UploadedFile, FileType } from '../config/types.js';
import { UploadedFilesStore } from '../storage/uploaded-files.store.js';
import { detectMimeType } from './mime-types.js';
import {
  MAX_FILE_SIZE,
  generateUniqueFilename,
  formatFileSize,
  isValidFileSize,
  getFileSizeErrorMessage
} from './file-upload-constants.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

export class FileUploadManager {
  private readonly uploadsPath: string;
  private readonly uploadStore: UploadedFilesStore;

  constructor(workspacePath: string, uploadStore: UploadedFilesStore) {
    this.uploadsPath = join(workspacePath, 'uploads');
    this.uploadStore = uploadStore;
  }

  /**
   * Download and save file from Telegram
   */
  async downloadAndSave(
    userId: string,
    fileId: string,
    filename: string,
    type: FileType,
    telegram: Telegram,
    metadata?: {
      width?: number;
      height?: number;
      duration?: number;
      mimeType?: string;
    }
  ): Promise<UploadedFile> {
    try {
      // Get file info from Telegram
      const file = await telegram.getFile(fileId);
      const fileSize = file.file_size || 0;

      // Validate size
      if (!isValidFileSize(fileSize)) {
        throw new AppError(getFileSizeErrorMessage(fileSize));
      }

      // Create user uploads directory
      const userUploadsPath = join(this.uploadsPath, userId);
      await mkdir(userUploadsPath, { recursive: true });

      // Generate unique filename with timestamp
      const uniqueFilename = generateUniqueFilename(filename);
      const filePath = join(userUploadsPath, uniqueFilename);

      // Download file from Telegram
      const fileUrl = `https://api.telegram.org/file/bot${telegram.token}/${file.file_path}`;
      const response = await fetch(fileUrl);

      if (!response.ok) {
        throw new AppError(`Failed to download file from Telegram: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(filePath, buffer);

      logger.info('File downloaded from Telegram', {
        userId,
        filename: uniqueFilename,
        size: fileSize,
        type
      });

      // Create upload record
      const upload: UploadedFile = {
        id: randomUUID(),
        userId,
        filename: uniqueFilename,
        path: filePath,
        type,
        mimeType: metadata?.mimeType || this.getMimeType(filename),
        size: fileSize,
        uploadedAt: new Date(),
        metadata: metadata
          ? {
              width: metadata.width,
              height: metadata.height,
              duration: metadata.duration
            }
          : undefined
      };

      // Save to store
      this.uploadStore.saveUpload(upload);

      return upload;
    } catch (error) {
      logger.error('Failed to download and save file', error);
      throw error;
    }
  }

  /**
   * Get recent uploads for user
   */
  getRecentUploads(userId: string, limit: number = 10): UploadedFile[] {
    return this.uploadStore.getRecentUploads(userId, limit);
  }

  /**
   * Get upload by ID
   */
  getUploadById(id: string): UploadedFile | null {
    return this.uploadStore.getUploadById(id);
  }

  /**
   * Get upload by path
   */
  getUploadByPath(path: string): UploadedFile | null {
    return this.uploadStore.getUploadByPath(path);
  }

  /**
   * Delete upload (both metadata and file)
   */
  async deleteUpload(id: string): Promise<void> {
    const upload = this.uploadStore.getUploadById(id);
    if (!upload) {
      throw new AppError(`Upload not found: ${id}`);
    }

    // Delete file from disk
    const fs = await import('fs/promises');
    try {
      await fs.unlink(upload.path);
      logger.info('File deleted from disk', { path: upload.path });
    } catch (error) {
      logger.warn('Failed to delete file from disk', { path: upload.path, error });
    }

    // Delete metadata
    this.uploadStore.deleteUpload(id);
  }

  /**
   * Cleanup old uploads (older than N days)
   */
  async cleanupOldUploads(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const deleted = this.uploadStore.cleanupOldUploads(cutoffDate);
    logger.info('Cleanup old uploads completed', { daysOld, deleted });

    return deleted;
  }

  /**
   * Detect MIME type from filename (centralized)
   */
  private getMimeType(filename: string): string {
    return detectMimeType(filename);
  }
}
