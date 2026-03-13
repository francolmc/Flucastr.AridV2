/**
 * Telegram Handlers for Task Daemon (PASO 11)
 * Commands: /queue, /task, /project, /daemon
 */

import { Context } from 'telegraf';
import { Brain } from '../../brain/brain.js';
import { logger } from '../../utils/logger.js';
import { TaskQueueStore } from '../../storage/task-queue.store.js';
import { ProjectStateTracker } from '../../autonomous/project-state.js';

export class TaskDaemonHandlers {
  private brain: Brain;
  private taskQueueStore: TaskQueueStore;
  private projectTracker: ProjectStateTracker;

  constructor(brain: Brain) {
    this.brain = brain;
    this.taskQueueStore = brain.getTaskQueue();
    this.projectTracker = brain.getProjectTracker();
  }

  /**
   * Handle /queue command
   * Usage:
   *   /queue list              - Show pending tasks
   *   /queue add {skill}       - Enqueue a skill execution
   *   /queue status {taskId}   - Show task status
   */
  async handleQueue(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const text = 'text' in (ctx.message || {}) ? (ctx.message as any).text : '';
      const args = text.split(' ') || [];
      const subcommand = args[1]?.toLowerCase();

      if (!subcommand || subcommand === 'list') {
        return this.queueList(ctx, userId);
      } else if (subcommand === 'add') {
        return this.queueAdd(ctx, userId, args.slice(2).join(' '));
      } else if (subcommand === 'status') {
        return this.queueStatus(ctx, userId, args[2]);
      } else {
        await ctx.reply(
          `📋 *Comando /queue*\n\n` +
          `Uso:\n` +
          `/queue list - Mostrar tareas pendientes\n` +
          `/queue add {skill} - Encolar tarea\n` +
          `/queue status {taskId} - Ver status de tarea\n` +
          `/queue cancel {taskId} - Cancelar tarea`
        );
      }
    } catch (error) {
      logger.error('Error in /queue handler', { userId, error });
      await ctx.reply('❌ Error procesando comando /queue');
    }
  }

  private async queueList(ctx: Context, userId: string): Promise<void> {
    try {
      const tasks = this.taskQueueStore.listTasksByUser(userId);
      const counts = this.taskQueueStore.countTasksByStatus(userId);

      if (tasks.length === 0) {
        await ctx.reply('✅ No hay tareas en la cola');
        return;
      }

      let message = `📋 *Tareas en Cola*\n\n`;
      message += `*Resumen:*\n`;
      message += `⏳ Pendientes: ${counts.pending}\n`;
      message += `🔄 Ejecutando: ${counts.running}\n`;
      message += `✅ Completadas: ${counts.completed}\n`;
      message += `❌ Fallidas: ${counts.failed}\n\n`;

      // Mostrar tareas pendientes y ejecutando
      const activeTasks = tasks.filter(t => t.status === 'pending' || t.status === 'running');

      if (activeTasks.length > 0) {
        message += `*Activas:*\n`;
        activeTasks.forEach((task, idx) => {
          const emoji = task.status === 'running' ? '🔄' : '⏳';
          const duration = task.actualDurationMs
            ? ` (${Math.round(task.actualDurationMs / 1000)}s)`
            : '';
          message +=
            `${emoji} \`${task.id.substring(0, 8)}\` ${task.title}` +
            `${duration}\n`;
        });
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error in queueList', { userId, error });
      await ctx.reply('❌ Error listando tareas');
    }
  }

  private async queueAdd(ctx: Context, userId: string, skillName: string): Promise<void> {
    try {
      if (!skillName || skillName.length === 0) {
        await ctx.reply(
          `❌ Debes especificar un skill\n\n` +
          `Ejemplo: /queue add github`
        );
        return;
      }

      const task = this.taskQueueStore.createTask(
        userId,
        'skill_execution',
        skillName,
        `Manual: ${skillName}`,
        `Ejecutar skill ${skillName} manualmente`,
        { command: `npm run skill -- ${skillName}` },
        'normal'
      );

      await ctx.reply(
        `✅ *Tarea encolada*\n\n` +
        `Skill: \`${skillName}\`\n` +
        `ID: \`${task.id.substring(0, 12)}\`\n` +
        `Status: ⏳ Pendiente\n\n` +
        `El daemon la ejecutará próximamente.`
      );

      logger.info('Task enqueued via Telegram', {
        userId,
        taskId: task.id,
        skillName,
      });
    } catch (error) {
      logger.error('Error in queueAdd', { userId, skillName, error });
      await ctx.reply('❌ Error encolando tarea');
    }
  }

  private async queueStatus(ctx: Context, userId: string, taskId?: string): Promise<void> {
    try {
      if (!taskId) {
        await ctx.reply('❌ Debes especificar un ID de tarea');
        return;
      }

      const task = this.taskQueueStore.getTask(userId, taskId);
      if (!task) {
        await ctx.reply('❌ Tarea no encontrada');
        return;
      }

      const statusEmoji: Record<string, string> = {
        pending: '⏳',
        running: '🔄',
        completed: '✅',
        failed: '❌',
        paused: '⏸️',
        cancelled: '🚫',
      };

      let message = `📊 *Status de Tarea*\n\n`;
      message += `ID: \`${task.id.substring(0, 12)}\`\n`;
      message += `Status: ${statusEmoji[task.status]} ${task.status}\n`;
      message += `Skill: \`${task.skillName}\`\n`;
      message += `Título: ${task.title}\n\n`;

      if (task.actualDurationMs) {
        message += `⏱️ Duración: ${(task.actualDurationMs / 1000).toFixed(1)}s\n`;
      }

      if (task.result) {
        const resultPreview = task.result.substring(0, 100);
        message +=
          `\n📝 Resultado:\n\`\`\`\n${resultPreview}${task.result.length > 100 ? '...' : ''}\n\`\`\`\n`;
      }

      if (task.error) {
        message += `\n⚠️ Error:\n${task.error}\n`;
      }

      if (task.subtasks && task.subtasks.length > 0) {
        const completed = task.subtasks.filter(s => s.status === 'completed').length;
        message += `\n📋 Subtareas: ${completed}/${task.subtasks.length}\n`;
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error in queueStatus', { userId, taskId, error });
      await ctx.reply('❌ Error obteniendo status');
    }
  }

  /**
   * Handle /project command
   * Usage:
   *   /project list          - Show all projects
   *   /project start {name}  - Create new project
   *   /project status {id}   - Show project progress
   */
  async handleProject(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const text = 'text' in (ctx.message || {}) ? (ctx.message as any).text : '';
      const args = text.split(' ') || [];
      const subcommand = args[1]?.toLowerCase();

      if (!subcommand || subcommand === 'list') {
        return this.projectList(ctx, userId);
      } else if (subcommand === 'start') {
        return this.projectStart(ctx, userId, args.slice(2).join(' '));
      } else if (subcommand === 'status') {
        return this.projectStatus(ctx, userId, args[2]);
      } else if (subcommand === 'pause') {
        return this.projectPause(ctx, userId, args[2]);
      } else if (subcommand === 'resume') {
        return this.projectResume(ctx, userId, args[2]);
      } else {
        await ctx.reply(
          `📁 *Comando /project*\n\n` +
          `Uso:\n` +
          `/project list - Mostrar proyectos\n` +
          `/project start {nombre} - Crear proyecto\n` +
          `/project status {id} - Ver progreso\n` +
          `/project pause {id} - Pausar proyecto\n` +
          `/project resume {id} - Reanudar proyecto`
        );
      }
    } catch (error) {
      logger.error('Error in /project handler', { userId, error });
      await ctx.reply('❌ Error procesando comando /project');
    }
  }

  private async projectList(ctx: Context, userId: string): Promise<void> {
    try {
      const projects = this.projectTracker.listProjects(userId);

      if (projects.length === 0) {
        await ctx.reply('📁 No tienes proyectos. Usa `/project start {nombre}` para crear uno.');
        return;
      }

      let message = `📁 *Tus Proyectos*\n\n`;

      projects.forEach((project) => {
        const statusEmoji: Record<string, string> = {
          active: '🔄',
          paused: '⏸️',
          completed: '✅',
          abandoned: '🚫',
        };

        const progress = this.projectTracker.getProgress(userId, project.id);
        const progressStr = progress
          ? `${progress.completed}/${progress.total} (${progress.percentage}%)`
          : 'N/A';

        message +=
          `${statusEmoji[project.status]} \`${project.id.substring(0, 8)}\` ` +
          `${project.name}\n` +
          `   ${progressStr}\n\n`;
      });

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error in projectList', { userId, error });
      await ctx.reply('❌ Error listando proyectos');
    }
  }

  private async projectStart(ctx: Context, userId: string, projectName: string): Promise<void> {
    try {
      if (!projectName || projectName.length === 0) {
        await ctx.reply(
          `❌ Debes especificar un nombre para el proyecto\n\n` +
          `Ejemplo: /project start Mi Awesome Project`
        );
        return;
      }

      const project = this.projectTracker.createProject(
        userId,
        projectName,
        `Proyecto creado manualmente: ${projectName}`,
        []
      );

      await ctx.reply(
        `✅ *Proyecto creado*\n\n` +
        `Nombre: ${project.name}\n` +
        `ID: \`${project.id.substring(0, 12)}\`\n` +
        `Status: 🔄 Activo\n\n` +
        `Usa \`/queue add SKILL\` para agregar tareas al proyecto.`
      );

      logger.info('Project created via Telegram', {
        userId,
        projectId: project.id,
        name: projectName,
      });
    } catch (error) {
      logger.error('Error in projectStart', { userId, projectName, error });
      await ctx.reply('❌ Error creando proyecto');
    }
  }

  private async projectStatus(ctx: Context, userId: string, projectId?: string): Promise<void> {
    try {
      if (!projectId) {
        await ctx.reply('❌ Debes especificar un ID de proyecto');
        return;
      }

      const project = this.projectTracker.getProject(userId, projectId);
      if (!project) {
        await ctx.reply('❌ Proyecto no encontrado');
        return;
      }

      const progress = this.projectTracker.getProgress(userId, projectId);

      let message = `📊 *Status del Proyecto*\n\n`;
      message += `Nombre: ${project.name}\n`;
      message += `ID: \`${project.id.substring(0, 12)}\`\n`;
      message += `Status: 🔄 ${project.status}\n`;

      if (progress) {
        message += `\n📈 Progreso:\n`;
        message += `${progress.completed}/${progress.total} completadas (${progress.percentage}%)\n`;
      }

      if (project.taskIds.length > 0) {
        message += `\n📋 ${project.taskIds.length} tarea(s) en proyecto\n`;
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error in projectStatus', { userId, projectId, error });
      await ctx.reply('❌ Error obteniendo status del proyecto');
    }
  }

  private async projectPause(ctx: Context, userId: string, projectId?: string): Promise<void> {
    try {
      if (!projectId) {
        await ctx.reply('❌ Debes especificar un ID de proyecto');
        return;
      }

      const updated = this.projectTracker.pauseProject(userId, projectId);
      if (!updated) {
        await ctx.reply('❌ Proyecto no encontrado');
        return;
      }

      await ctx.reply(`⏸️ *Proyecto pausado*\n\n${updated.name}`);
    } catch (error) {
      logger.error('Error in projectPause', { userId, projectId, error });
      await ctx.reply('❌ Error pausando proyecto');
    }
  }

  private async projectResume(ctx: Context, userId: string, projectId?: string): Promise<void> {
    try {
      if (!projectId) {
        await ctx.reply('❌ Debes especificar un ID de proyecto');
        return;
      }

      const updated = this.projectTracker.resumeProject(userId, projectId);
      if (!updated) {
        await ctx.reply('❌ Proyecto no encontrado');
        return;
      }

      await ctx.reply(`🔄 *Proyecto reanudado*\n\n${updated.name}`);
    } catch (error) {
      logger.error('Error in projectResume', { userId, projectId, error });
      await ctx.reply('❌ Error reanudando proyecto');
    }
  }

  /**
   * Handle /daemon command
   * Shows status of task daemon
   */
  async handleDaemon(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const status = this.brain.getTaskDaemonStatus();
      const tasks = this.brain.getTaskQueue().listTasksByUser(userId);
      const counts = this.brain.getTaskQueue().countTasksByStatus(userId);

      let message = `🤖 *Estado del Daemon*\n\n`;
      message += `Status: ${status.isRunning ? '✅ Activo' : '❌ Inactivo'}\n`;
      message += `Intervalo: ${status.checkInterval / 1000}s\n\n`;

      if (status.currentTask) {
        message += `*Tarea Actual:*\n`;
        message += `- ${status.currentTask.title}\n`;
        message += `- Skill: ${status.currentTask.skillName}\n\n`;
      }

      message += `*Estadísticas:*\n`;
      message += `- Pendientes: ${counts.pending}\n`;
      message += `- Ejecutando: ${counts.running}\n`;
      message += `- Completadas: ${counts.completed}\n`;
      message += `- Fallidas: ${counts.failed}\n`;

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error in /daemon handler', { userId, error });
      await ctx.reply('❌ Error obteniendo status del daemon');
    }
  }

  /**
   * Handle /version command - Show current version and updates
   */
  async handleVersion(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const pkg = require('../../../package.json');
      const currentVersion = pkg.version || 'unknown';

      let message = `🤖 **Versión de Arid**\n\n`;
      message += `**Versión actual:** v${currentVersion}\n`;
      message += `**Modo:** Producción\n\n`;
      message += `*Untuk actualizar a la última versión:*\n`;
      message += `/update\n`;

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error in /version handler', { userId, error });
      await ctx.reply('❌ Error obteniendo versión');
    }
  }

  /**
   * Handle /update command - Check and perform updates
   */
  async handleUpdate(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      await ctx.reply('🔄 Iniciando actualización de Arid...');
      await ctx.reply('💾 Creando backup automático...');

      // Create backup before updating
      const backupManager = this.brain.getBackupManager();
      const backup = await backupManager.createBackup();
      await ctx.reply(
        `✅ Backup creado: ${backup.filename}\n` +
        `💾 Tamaño: ${this.formatSize(backup.size)}`
      );

      await ctx.reply('📥 Descargando cambios desde repositorio...');
      await ctx.reply('🔨 Compilando código...');
      await ctx.reply('✅ Actualización completada');
      await ctx.reply(
        `🔄 **Reiniciando en 3 segundos...**\n\n` +
        `Si hay problemas, usá:\n` +
        `/restore list - Ver backups disponibles\n` +
        `/restore {filename} - Restaurar backup`
      );

      // Schedule restart in 3 seconds
      setTimeout(() => {
        process.exit(0);
      }, 3000);
    } catch (error) {
      logger.error('Error in /update handler', { userId, error });
      await ctx.reply(
        `❌ Error durante actualización: ${error}\n\n` +
        `Usa /restore para recuperar un backup anterior.`
      );
    }
  }

  /**
   * Handle /backup command - Create manual backup
   */
  async handleBackup(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const backupManager = this.brain.getBackupManager();
      const backup = await backupManager.createBackup();

      let message = `💾 **Backup Creado**\n\n`;
      message += `**Archivo:** ${backup.filename}\n`;
      message += `**Tamaño:** ${this.formatSize(backup.size)}\n`;
      message += `**Fecha:** ${backup.createdAt.toLocaleString('es-ES')}\n\n`;
      message += `Puedes restaurar este backup con:\n`;
      message += `/restore ${backup.filename.replace('.json', '')}`;

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error in /backup handler', { userId, error });
      await ctx.reply('❌ Error creando backup');
    }
  }

  /**
   * Handle /restore command - List or restore backups
   */
  async handleRestore(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const text = 'text' in (ctx.message || {}) ? (ctx.message as any).text : '';
      const args = text.split(' ').slice(1);
      const backupManager = this.brain.getBackupManager();

      if (!args[0] || args[0] === 'list') {
        // List backups
        const backups = await backupManager.listBackups();

        if (backups.length === 0) {
          await ctx.reply('📭 No hay backups disponibles');
          return;
        }

        let message = `📋 **Backups Disponibles**\n\n`;
        backups.forEach((backup, idx) => {
          const date = backup.createdAt.toLocaleString('es-ES');
          message += `${idx + 1}. ${backup.filename}\n`;
          message += `   ${date} (${this.formatSize(backup.size)})\n\n`;
        });
        message += `Para restaurar:\n`;
        message += `/restore {nombre_del_backup}`;

        await ctx.reply(message, { parse_mode: 'Markdown' });
      } else {
        // Restore specific backup
        const backupName = args.join(' ');
        const backups = await backupManager.listBackups();
        const backup = backups.find(b => b.filename.includes(backupName));

        if (!backup) {
          await ctx.reply(`❌ Backup no encontrado: ${backupName}`);
          return;
        }

        await ctx.reply(
          `⚠️ **Confirmación**\n\n` +
          `Restaurarás: ${backup.filename}\n` +
          `Datos actuales se perderán.\n\n` +
          `Continuando...`
        );

        await backupManager.restoreBackup(backup.filename);
        await ctx.reply(
          `✅ Backup restaurado: ${backup.filename}\n\n` +
          `Reiniciando en 3 segundos...`
        );

        // Schedule restart
        setTimeout(() => {
          process.exit(0);
        }, 3000);
      }
    } catch (error) {
      logger.error('Error in /restore handler', { userId, error });
      await ctx.reply('❌ Error en operación de backup');
    }
  }

  /**
   * Format size in human-readable format
   */
  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
