/**
 * Update Manager
 * Handles checking for updates and performing updates
 * PASO 11: Production System - Updates
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';

const execAsync = promisify(exec);

export interface UpdateInfo {
  currentVersion: string;
  latestCommit: string;
  latestHash: string;
  updatesAvailable: boolean;
  commitsDiff: string[];
}

export interface UpdateResult {
  success: boolean;
  message: string;
  logs: string[];
  errors?: string[];
}

export class UpdateManager {
  private projectRoot: string;
  private branch: string = 'main';

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Get current version from package.json
   */
  private async getCurrentVersion(): Promise<string> {
    try {
      const content = await readFile(`${this.projectRoot}/package.json`, 'utf-8');
      const pkg = JSON.parse(content);
      return pkg.version || '0.0.0';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get current commit info
   */
  private async getCurrentCommit(): Promise<string> {
    try {
      const { stdout } = await execAsync('git log -1 --oneline', {
        cwd: this.projectRoot
      });
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Check for updates
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    try {
      // Fetch latest from remote
      await execAsync(`git fetch origin ${this.branch}`, {
        cwd: this.projectRoot
      });

      const currentVersion = await this.getCurrentVersion();
      const currentCommit = await this.getCurrentCommit();

      // Get latest commit on remote
      const { stdout: latestOutput } = await execAsync(
        `git log origin/${this.branch} -1 --oneline`,
        { cwd: this.projectRoot }
      );
      const latestCommit = latestOutput.trim();
      const latestHash = latestCommit.split(' ')[0];

      // Get commits diff
      const { stdout: diffOutput } = await execAsync(
        `git log HEAD..origin/${this.branch} --oneline`,
        { cwd: this.projectRoot }
      );
      const commitsDiff = diffOutput
        .trim()
        .split('\n')
        .filter(line => line.length > 0);

      const updatesAvailable = commitsDiff.length > 0;

      logger.info('Update check completed', {
        currentVersion,
        updatesAvailable,
        pendingCommits: commitsDiff.length
      });

      return {
        currentVersion,
        latestCommit,
        latestHash,
        updatesAvailable,
        commitsDiff
      };
    } catch (error) {
      logger.error('Failed to check for updates', error);
      throw new StorageError(`Failed to check for updates: ${error}`);
    }
  }

  /**
   * Perform the update
   */
  async performUpdate(): Promise<UpdateResult> {
    const logs: string[] = [];
    const errors: string[] = [];

    try {
      // Step 1: Pull latest code
      logs.push('📥 Descargando cambios...');
      try {
        const { stdout } = await execAsync(`git pull origin ${this.branch}`, {
          cwd: this.projectRoot
        });
        logs.push(`✅ Git pull completado`);
      } catch (error: any) {
        errors.push(`Git pull failed: ${error.message}`);
        return {
          success: false,
          message: 'Error al descargar cambios',
          logs,
          errors
        };
      }

      // Step 2: Install dependencies (if package.json changed)
      logs.push('📦 Instalando dependencias...');
      try {
        await execAsync('pnpm install', {
          cwd: this.projectRoot,
          timeout: 300000 // 5 minutes
        });
        logs.push(`✅ Dependencias instaladas`);
      } catch (error: any) {
        errors.push(`pnpm install failed: ${error.message}`);
        return {
          success: false,
          message: 'Error al instalar dependencias',
          logs,
          errors
        };
      }

      // Step 3: Build TypeScript
      logs.push('🔨 Compilando código...');
      try {
        await execAsync('npm run build', {
          cwd: this.projectRoot,
          timeout: 120000 // 2 minutes
        });
        logs.push(`✅ Compilación completada`);
      } catch (error: any) {
        errors.push(`Build failed: ${error.message}`);
        return {
          success: false,
          message: 'Error al compilar código',
          logs,
          errors
        };
      }

      const newVersion = await this.getCurrentVersion();
      const newCommit = await this.getCurrentCommit();

      logs.push(`✅ Actualizado a versión ${newVersion}`);
      logs.push(`✅ Último commit: ${newCommit}`);

      return {
        success: true,
        message: `Actualizado a ${newVersion}. Reiniciando...`,
        logs
      };
    } catch (error) {
      logger.error('Update failed', error);
      return {
        success: false,
        message: 'Error durante la actualización',
        logs,
        errors: [String(error)]
      };
    }
  }

  /**
   * Force restart the process
   */
  async restartProcess(): Promise<void> {
    logger.info('Restarting process...');
    process.exit(0); // Exit and let PM2/supervisor restart it
  }
}
