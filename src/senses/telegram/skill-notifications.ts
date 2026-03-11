import { Context } from 'telegraf';
import { logger } from '../../utils/logger.js';
import { BackgroundProcess } from '../../config/types.js';
import { SkillThread } from '../../brain/skill-thread-executor.js';

/**
 * SkillNotifications - Notificaciones proactivas de skills (Fase 10)
 *
 * Responsabilidades:
 * - Notificar cuando procesos background completan
 * - Notificar cuando hilos de skill terminan (exitosamente o con error)
 * - Formatear resultados de forma amigable (resumen de output)
 * - Ofrecer acciones: ver detalles, reintentar, cancelar
 * - Adaptar nivel de detalle según contexto
 *
 * Flujo:
 * 1. BackgroundProcessStore marca proceso como completed/failed
 * 2. SkillNotifications.notifyProcessCompletion() es llamado
 * 3. Formatea resultado y envía mensaje a Telegram
 * 4. Usuario puede interactuar con botones inline
 */
export class SkillNotifications {
  private readonly MAX_OUTPUT_LENGTH = 500; // Truncar output muy largo

  constructor() {
    logger.info('SkillNotifications initialized');
  }

  /**
   * Notifica al usuario que un proceso background completó
   */
  async notifyProcessCompletion(ctx: Context, userId: string, process: BackgroundProcess): Promise<void> {
    try {
      if (process.status === 'completed') {
        await this.sendSuccessNotification(ctx, userId, process);
      } else if (process.status === 'failed') {
        await this.sendFailureNotification(ctx, userId, process);
      } else if (process.status === 'cancelled') {
        await this.sendCancelledNotification(ctx, userId, process);
      }
    } catch (error) {
      logger.error('Failed to send process completion notification', {
        userId,
        processId: process.id,
        error,
      });
    }
  }

  /**
   * Notifica que un hilo de skill completó
   */
  async notifyThreadCompletion(ctx: Context, userId: string, thread: SkillThread): Promise<void> {
    try {
      if (thread.status === 'completed') {
        await this.sendThreadSuccessNotification(ctx, userId, thread);
      } else if (thread.status === 'failed') {
        await this.sendThreadFailureNotification(ctx, userId, thread);
      }
    } catch (error) {
      logger.error('Failed to send thread completion notification', {
        userId,
        threadId: thread.id,
        error,
      });
    }
  }

  /**
   * Notifica en tiempo real el progreso de un hilo
   */
  async notifyThreadProgress(
    ctx: Context,
    userId: string,
    threadId: string,
    progress: number,
    currentStep: number,
    totalSteps: number
  ): Promise<void> {
    try {
      const progressBar = this.createProgressBar(progress);

      const message = `⏳ Progreso del skill: ${progressBar}\n\n` +
        `Paso ${currentStep}/${totalSteps} en ejecución\n\n` +
        `ID: \`${threadId.substring(0, 8)}\``;

      await ctx.reply(message, {
        parse_mode: 'Markdown',
      });

      logger.debug('Thread progress notification sent', {
        userId,
        threadId,
        progress,
        currentStep,
      });
    } catch (error) {
      logger.error('Failed to send thread progress notification', {
        userId,
        threadId,
        error,
      });
    }
  }

  /**
   * Notifica credenciales necesarios para usar un skill
   */
  async notifyCredentialsRequired(
    ctx: Context,
    userId: string,
    skillName: string,
    requiredCredentials: string[]
  ): Promise<void> {
    try {
      const credentialsList = requiredCredentials.map((c) => `• ${c}`).join('\n');

      const message = `🔐 El skill *${skillName}* necesita credenciales:\n\n` +
        `${credentialsList}\n\n` +
        `Proporciona los valores para continuar.`;

      await ctx.reply(message, {
        parse_mode: 'Markdown',
      });

      logger.info('Credentials requirement notification sent', {
        userId,
        skillName,
        requiredCount: requiredCredentials.length,
      });
    } catch (error) {
      logger.error('Failed to send credentials requirement notification', {
        userId,
        skillName,
        error,
      });
    }
  }

  /**
   * Notifica sugerencia de crear un skill
   */
  async notifySkillCreationSuggestion(
    ctx: Context,
    userId: string,
    suggestedSkillName: string,
    description: string,
    frequency: number
  ): Promise<void> {
    try {
      const message = `💡 *Sugerencia de Skill*\n\n` +
        `He notado que has mencionado "${description}" ${frequency} veces. ` +
        `¿Te gustaría crear un skill para esto?\n\n` +
        `Skill sugerido: \`${suggestedSkillName}\``;

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Sí, crear', callback_data: `create_skill:${suggestedSkillName}` }],
            [{ text: '❌ No, gracias', callback_data: 'dismiss_suggestion' }],
          ],
        },
      });

      logger.info('Skill creation suggestion notification sent', {
        userId,
        suggestedSkill: suggestedSkillName,
      });
    } catch (error) {
      logger.error('Failed to send skill creation suggestion', {
        userId,
        skilName: suggestedSkillName,
        error,
      });
    }
  }

  /**
   * Envía notificación de éxito de proceso
   */
  private async sendSuccessNotification(ctx: Context, userId: string, process: BackgroundProcess): Promise<void> {
    const output = process.output || '';
    const truncated = output.length > this.MAX_OUTPUT_LENGTH;
    const displayOutput = truncated ? output.substring(0, this.MAX_OUTPUT_LENGTH) + '...' : output;

    const message = `✅ *Skill completado: ${process.skillName}*\n\n` +
      `Comando: \`${process.command.substring(0, 50)}${process.command.length > 50 ? '...' : ''}\`\n\n` +
      `Output:\n\`\`\`\n${displayOutput}\n\`\`\``;

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Ver detalles', callback_data: `show_process:${process.id}` }],
          [{ text: '🔄 Repetir', callback_data: `retry_process:${process.id}` }],
        ],
      },
    });

    logger.info('Success notification sent', {
      userId,
      processId: process.id,
      skillName: process.skillName,
    });
  }

  /**
   * Envía notificación de fallo de proceso
   */
  private async sendFailureNotification(ctx: Context, userId: string, process: BackgroundProcess): Promise<void> {
    const error = process.error || 'Error desconocido';
    const command = process.command.substring(0, 50) + (process.command.length > 50 ? '...' : '');

    const message = `❌ *Skill falló: ${process.skillName}*\n\n` +
      `Comando: \`${command}\`\n\n` +
      `Error: \`${error}\``;

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Reintentar', callback_data: `retry_process:${process.id}` }],
          [{ text: '❌ Cancelar', callback_data: `cancel_process:${process.id}` }],
        ],
      },
    });

    logger.warn('Failure notification sent', {
      userId,
      processId: process.id,
      skillName: process.skillName,
      error,
    });
  }

  /**
   * Envía notificación de cancelación de proceso
   */
  private async sendCancelledNotification(
    ctx: Context,
    userId: string,
    process: BackgroundProcess
  ): Promise<void> {
    const message = `⊘ *Skill cancelado: ${process.skillName}*\n\n` +
      `El proceso fue cancelado por el usuario.`;

    await ctx.reply(message, {
      parse_mode: 'Markdown',
    });

    logger.info('Cancellation notification sent', {
      userId,
      processId: process.id,
      skillName: process.skillName,
    });
  }

  /**
   * Envía notificación de éxito de hilo
   */
  private async sendThreadSuccessNotification(ctx: Context, userId: string, thread: SkillThread): Promise<void> {
    const completedSteps = thread.steps.filter((s: any) => s.status === 'completed').length;
    const totalTime = thread.completedAt
      ? Math.round((thread.completedAt.getTime() - thread.startedAt.getTime()) / 1000)
      : 0;

    const message = `✅ *Skill completado: ${thread.skillName}*\n\n` +
      `${completedSteps}/${thread.steps.length} pasos ejecutados\n` +
      `⏱️ Tiempo total: ${totalTime}s\n\n` +
      `ID del hilo: \`${thread.id.substring(0, 8)}\``;

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 Ver detalles', callback_data: `show_thread:${thread.id}` }],
          [{ text: '🔄 Ejecutar de nuevo', callback_data: `retry_thread:${thread.id}` }],
        ],
      },
    });

    logger.info('Thread success notification sent', {
      userId,
      threadId: thread.id,
      skillName: thread.skillName,
      totalSteps: thread.steps.length,
    });
  }

  /**
   * Envía notificación de fallo de hilo
   */
  private async sendThreadFailureNotification(ctx: Context, userId: string, thread: SkillThread): Promise<void> {
    const failedStep = thread.steps.find((s: any) => s.status === 'failed');
    const failedStepNum = failedStep?.stepNumber || thread.currentStep + 1;
    const error = failedStep?.error || 'Error desconocido';

    const message = `❌ *Skill falló en paso ${failedStepNum}/${thread.steps.length}*\n\n` +
      `Skill: ${thread.skillName}\n` +
      `Error: \`${error}\`\n\n` +
      `ID del hilo: \`${thread.id.substring(0, 8)}\``;

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Reintentar desde aquí', callback_data: `retry_thread_from:${thread.id}:${failedStepNum}` },
          ],
          [{ text: '📊 Ver detalles', callback_data: `show_thread:${thread.id}` }],
        ],
      },
    });

    logger.warn('Thread failure notification sent', {
      userId,
      threadId: thread.id,
      skillName: thread.skillName,
      failedStep: failedStepNum,
    });
  }

  /**
   * Crea una barra de progreso visual
   */
  private createProgressBar(progress: number): string {
    const filledBlocks = Math.round((progress / 100) * 10);
    const emptyBlocks = 10 - filledBlocks;

    const filled = '█'.repeat(filledBlocks);
    const empty = '░'.repeat(emptyBlocks);

    return `${filled}${empty} ${progress}%`;
  }
}
