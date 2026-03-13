/**
 * Integrity Checker
 * Validates and repairs store data structure
 * PASO 11: Production System - Data Integrity
 */

import { readFile, writeFile } from 'fs/promises';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';

export interface IntegrityReport {
  isValid: boolean;
  missingKeys: string[];
  invalidTypes: string[];
  corruptedData: string[];
  warnings: string[];
  repaired: boolean;
  repairs: string[];
}

export class IntegrityChecker {
  private storeFilePath: string;

  // Expected keys in store data
  private requiredKeys = [
    'conversations',
    'profiles',
    'onboarding',
    'tokens',
    'memories',
    'prospective',
    'tasks',
    'projects',
    'task_execution_log'
  ];

  constructor(storeFilePath: string) {
    this.storeFilePath = storeFilePath;
  }

  /**
   * Check store integrity
   */
  async checkStoreIntegrity(): Promise<IntegrityReport> {
    const report: IntegrityReport = {
      isValid: true,
      missingKeys: [],
      invalidTypes: [],
      corruptedData: [],
      warnings: [],
      repaired: false,
      repairs: []
    };

    try {
      const content = await readFile(this.storeFilePath, 'utf-8');
      let data: any;

      try {
        data = JSON.parse(content);
      } catch (error) {
        report.isValid = false;
        report.corruptedData.push('JSON parse error: ' + error);
        return report;
      }

      if (!data || typeof data !== 'object') {
        report.isValid = false;
        report.corruptedData.push('Store is not an object');
        return report;
      }

      // Check for required keys
      for (const key of this.requiredKeys) {
        if (!(key in data)) {
          report.isValid = false;
          report.missingKeys.push(key);
        }
      }

      // Check types
      if (data.conversations && typeof data.conversations !== 'object') {
        report.isValid = false;
        report.invalidTypes.push('conversations is not an object');
      }

      if (data.profiles && typeof data.profiles !== 'object') {
        report.isValid = false;
        report.invalidTypes.push('profiles is not an object');
      }

      if (data.tasks && typeof data.tasks !== 'object') {
        report.isValid = false;
        report.invalidTypes.push('tasks is not an object');
      }

      if (data.projects && typeof data.projects !== 'object') {
        report.isValid = false;
        report.invalidTypes.push('projects is not an object');
      }

      // Check if store has excessive data
      const storeSize = JSON.stringify(data).length;
      const maxSize = 50 * 1024 * 1024; // 50MB

      if (storeSize > maxSize) {
        report.warnings.push(
          `Store size (${Math.round(storeSize / 1024 / 1024)}MB) exceeds recommended maximum`
        );
      }

      // Check conversation history limits
      for (const [userId, conversations] of Object.entries(data.conversations || {})) {
        if (Array.isArray(conversations) && conversations.length > 50) {
          report.warnings.push(
            `User ${userId} has ${conversations.length} messages, recommend cleanup`
          );
        }
      }

      logger.info('Integrity check completed', {
        valid: report.isValid,
        missing: report.missingKeys.length,
        invalidTypes: report.invalidTypes.length
      });

      return report;
    } catch (error) {
      logger.error('Failed to check integrity', error);
      throw new StorageError(`Failed to check integrity: ${error}`);
    }
  }

  /**
   * Repair store with missing or invalid data
   */
  async repairStore(): Promise<IntegrityReport> {
    const report = await this.checkStoreIntegrity();

    if (report.isValid) {
      report.repaired = true;
      return report;
    }

    try {
      const content = await readFile(this.storeFilePath, 'utf-8');
      const data = JSON.parse(content);

      // Add missing keys with defaults
      for (const key of this.requiredKeys) {
        if (!(key in data)) {
          if (key === 'task_execution_log') {
            data[key] = [];
          } else {
            data[key] = {};
          }
          report.repairs.push(`Added missing key: ${key}`);
        }
      }

      // Fix invalid types
      if (data.conversations && typeof data.conversations !== 'object') {
        data.conversations = {};
        report.repairs.push('Reset conversations to object');
      }

      if (data.profiles && typeof data.profiles !== 'object') {
        data.profiles = {};
        report.repairs.push('Reset profiles to object');
      }

      if (data.tasks && typeof data.tasks !== 'object') {
        data.tasks = {};
        report.repairs.push('Reset tasks to object');
      }

      if (data.projects && typeof data.projects !== 'object') {
        data.projects = {};
        report.repairs.push('Reset projects to object');
      }

      // Write repaired data
      await writeFile(this.storeFilePath, JSON.stringify(data, null, 2), 'utf-8');

      report.repaired = true;
      report.isValid = true;

      logger.info('Store repaired', {
        repairs: report.repairs.length,
        details: report.repairs
      });

      return report;
    } catch (error) {
      logger.error('Failed to repair store', error);
      throw new StorageError(`Failed to repair store: ${error}`);
    }
  }

  /**
   * Get detailed integrity report
   */
  async getIntegrityReport(): Promise<string> {
    const report = await this.checkStoreIntegrity();

    let message = '📊 **Reporte de Integridad de Datos**\n\n';
    message += `**Estado:** ${report.isValid ? '✅ Válido' : '❌ Problemas detectados'}\n\n`;

    if (report.missingKeys.length > 0) {
      message += `**Claves faltantes (${report.missingKeys.length}):**\n`;
      report.missingKeys.forEach(key => {
        message += `• ${key}\n`;
      });
      message += '\n';
    }

    if (report.invalidTypes.length > 0) {
      message += `**Tipos inválidos (${report.invalidTypes.length}):**\n`;
      report.invalidTypes.forEach(type => {
        message += `• ${type}\n`;
      });
      message += '\n';
    }

    if (report.corruptedData.length > 0) {
      message += `**Datos corruptos (${report.corruptedData.length}):**\n`;
      report.corruptedData.forEach(data => {
        message += `• ${data}\n`;
      });
      message += '\n';
    }

    if (report.warnings.length > 0) {
      message += `**Advertencias (${report.warnings.length}):**\n`;
      report.warnings.forEach(warning => {
        message += `• ${warning}\n`;
      });
      message += '\n';
    }

    if (report.repaired) {
      message += `**Reparaciones realizadas:**\n`;
      report.repairs.forEach(repair => {
        message += `• ✅ ${repair}\n`;
      });
    }

    return message;
  }
}
