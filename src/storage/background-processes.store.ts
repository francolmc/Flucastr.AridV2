/**
 * BackgroundProcessStore - Gestiona procesos asíncronos de skills
 * Almacena estado de comandos de larga duración ejecutándose en background
 * Fase 9: Skills System
 */

import { randomUUID } from 'crypto';
import { DB } from './db.js';
import { BackgroundProcess, ProcessStatus } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';

export class BackgroundProcessStore {
  /**
   * Crear nuevo proceso background
   */
  createProcess(userId: string, skillName: string, command: string): BackgroundProcess {
    try {
      const process: BackgroundProcess = {
        id: randomUUID(),
        userId,
        skillName,
        command,
        status: 'running',
        startedAt: new Date(),
      };

      const store = DB.getInstance();
      store.addBackgroundProcess(userId, process);

      logger.info('Background process created', {
        userId,
        skillName,
        processId: process.id,
      });

      return process;
    } catch (error) {
      logger.error('Failed to create background process', error);
      throw new StorageError(`Failed to create background process: ${error}`);
    }
  }

  /**
   * Obtener un proceso por ID
   */
  getProcess(userId: string, processId: string): BackgroundProcess | null {
    try {
      const store = DB.getInstance();
      return store.getBackgroundProcess(userId, processId) || null;
    } catch (error) {
      logger.error('Failed to get background process', error);
      return null;
    }
  }

  /**
   * Actualizar estado de un proceso
   */
  updateProcess(
    userId: string,
    processId: string,
    updates: Partial<BackgroundProcess>
  ): BackgroundProcess | null {
    try {
      const store = DB.getInstance();
      const process = store.getBackgroundProcess(userId, processId);

      if (!process) {
        return null;
      }

      const updated: BackgroundProcess = {
        ...process,
        ...updates,
        updatedAt: new Date(),
      };

      // Si se completa, calcular duración
      if (updates.status && updates.status !== 'running' && process.completedAt) {
        updated.durationsMs = process.completedAt.getTime() - process.startedAt.getTime();
      }

      store.updateBackgroundProcess(userId, processId, updated);

      logger.debug('Background process updated', {
        userId,
        processId,
        status: updated.status,
      });

      return updated;
    } catch (error) {
      logger.error('Failed to update background process', error);
      return null;
    }
  }

  /**
   * Marcar proceso como completado
   */
  completeProcess(
    userId: string,
    processId: string,
    output: string,
    exitCode: number = 0
  ): BackgroundProcess | null {
    try {
      const now = new Date();
      return this.updateProcess(userId, processId, {
        status: (exitCode === 0 ? 'completed' : 'failed') as ProcessStatus,
        completedAt: now,
        output,
        exitCode,
      });
    } catch (error) {
      logger.error('Failed to complete background process', error);
      return null;
    }
  }

  /**
   * Marcar proceso como fallido
   */
  failProcess(
    userId: string,
    processId: string,
    error: string
  ): BackgroundProcess | null {
    try {
      return this.updateProcess(userId, processId, {
        status: 'failed',
        completedAt: new Date(),
        error,
      });
    } catch (error) {
      logger.error('Failed to fail background process', error);
      return null;
    }
  }

  /**
   * Cancelar un proceso
   */
  cancelProcess(userId: string, processId: string): BackgroundProcess | null {
    try {
      return this.updateProcess(userId, processId, {
        status: 'cancelled',
        completedAt: new Date(),
      });
    } catch (error) {
      logger.error('Failed to cancel background process', error);
      return null;
    }
  }

  /**
   * Listar procesos de un usuario
   */
  listProcesses(userId: string, statusFilter?: ProcessStatus[]): BackgroundProcess[] {
    try {
      const store = DB.getInstance();
      let processes = store.getBackgroundProcesses(userId) || [];

      if (statusFilter) {
        processes = processes.filter(p => statusFilter.includes(p.status));
      }

      return processes.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    } catch (error) {
      logger.error('Failed to list background processes', error);
      return [];
    }
  }

  /**
   * Obtener procesos en ejecución
   */
  getRunningProcesses(userId: string): BackgroundProcess[] {
    return this.listProcesses(userId, ['running']);
  }

  /**
   * Obtener procesos completados recientemente (últimas 24h)
   */
  getRecentCompletions(userId: string): BackgroundProcess[] {
    try {
      const processes = this.listProcesses(userId, ['completed', 'failed', 'cancelled']);
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      return processes.filter(p => p.completedAt && p.completedAt >= oneDayAgo);
    } catch (error) {
      logger.error('Failed to get recent completions', error);
      return [];
    }
  }

  /**
   * Limpiar procesos antiguos (> 7 días)
   */
  cleanupOldProcesses(userId: string, olderThanDays: number = 7): number {
    try {
      const store = DB.getInstance();
      const processes = store.getBackgroundProcesses(userId) || [];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      let deletedCount = 0;

      for (const process of processes) {
        const processDate = process.completedAt || process.startedAt;
        if (processDate < cutoffDate) {
          store.deleteBackgroundProcess(userId, process.id);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        logger.info('Cleaned up old background processes', {
          userId,
          deletedCount,
          olderThanDays,
        });
      }

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old processes', error);
      return 0;
    }
  }
}
