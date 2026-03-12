/**
 * Telegram Message Handlers
 */

import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { Brain } from '../../brain/brain.js';
import { OnboardingService } from '../../onboarding/onboarding.service.js';
import { ProfileStore } from '../../storage/profile.store.js';
import { TelegramFormatter } from './formatter.js';
import { WhisperService } from '../../transcription/whisper.service.js';
import { ToolActionRequest } from '../../hands/tool-actions.store.js';
import { FileUploadManager } from '../../hands/file-upload-manager.js';
import { TaskDaemonHandlers } from './task-daemon-handlers.js';
import { logger } from '../../utils/logger.js';

export class TelegramHandlers {
  private brain: Brain;
  private onboardingService: OnboardingService;
  private profileStore: ProfileStore;
  private whisperService: WhisperService;
  private fileUploadManager: FileUploadManager;
  private taskDaemonHandlers: TaskDaemonHandlers;

  constructor(
    brain: Brain,
    onboardingService: OnboardingService,
    whisperService: WhisperService,
    fileUploadManager: FileUploadManager
  ) {
    this.brain = brain;
    this.onboardingService = onboardingService;
    this.profileStore = new ProfileStore();
    this.whisperService = whisperService;
    this.fileUploadManager = fileUploadManager;
    this.taskDaemonHandlers = new TaskDaemonHandlers(brain);
  }

  /**
   * Handle /start command
   */
  async handleStart(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const message = `¡Hola! 👋

Soy **Arid**, tu asistente conversacional.

Puedo ayudarte con:
- Conversaciones naturales en español
- Responder preguntas
- Dar ideas y consejos
- Mantener conversaciones interesantes
- Aprender sobre ti y personalizar mis respuestas

**Comandos disponibles:**
/start - Mostrar este mensaje
/reset - Limpiar historial de conversación
/profile - Ver tu perfil
/memories - Ver lo que he aprendido sobre ti
/tasks - Ver tus tareas e intenciones futuras
/done - Marcar tarea como completada
/delete - Eliminar una intención
/stats - Ver estadísticas de uso

**Daemon de Tareas (PASO 11):**
/queue - Gestionar cola de tareas
/project - Gestionar proyectos
/daemon - Ver estado del daemon

¡Empecemos!`;

      await ctx.reply(message);
    } catch (error) {
      logger.error('Error in /start handler', error);
      await ctx.reply('Error al procesar el comando. Intenta de nuevo.');
    }
  }

  /**
   * Handle /reset command
   */
  async handleReset(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      this.brain.clearHistory(userId);
      await ctx.reply('✅ Historial de conversación limpiado. ¡Empecemos de nuevo!');
    } catch (error) {
      logger.error('Error in /reset handler', error);
      await ctx.reply('Error al limpiar el historial. Intenta de nuevo.');
    }
  }

  /**
   * Handle /profile command
   */
  async handleProfile(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const profile = this.profileStore.getProfile(userId);
      const messageCount = this.brain.getMessageCount(userId);

      let message = `👤 **Tu Perfil**\n\n`;
      message += `**Agente:** ${profile.agentName}\n`;
      message += `**Tono:** ${profile.agentTone}\n`;

      if (profile.userName) {
        message += `**Tu nombre:** ${profile.userName}\n`;
      }

      if (profile.preferences) {
        message += `**Intereses:** ${profile.preferences}\n`;
      }

      message += `\n**Estadísticas:**\n`;
      message += `- Mensajes en historial: ${messageCount}\n`;

      await ctx.reply(message);
    } catch (error) {
      logger.error('Error in /profile handler', error);
      await ctx.reply('Error al obtener el perfil. Intenta de nuevo.');
    }
  }

  /**
   * Handle /stats command
   */
  async handleStats(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const stats = this.brain.getTotalTokenStats(userId);
      const formatted = TelegramFormatter.formatTokenStats(stats);
      await ctx.reply(formatted);
    } catch (error) {
      logger.error('Error in /stats handler', error);
      await ctx.reply('Error al obtener estadísticas. Intenta de nuevo.');
    }
  }

  /**
   * Handle /memories command
   */
  async handleMemories(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const memories = this.brain.getMemories(userId, 20);

      if (memories.length === 0) {
        await ctx.reply('Aún no tengo memorias sobre ti. ¡Sigamos conversando para que pueda conocerte mejor!');
        return;
      }

      // Group by category
      const byCategory = {
        fact: memories.filter(m => m.category === 'fact'),
        preference: memories.filter(m => m.category === 'preference'),
        project: memories.filter(m => m.category === 'project'),
        context: memories.filter(m => m.category === 'context')
      };

      let message = '📝 **Memorias sobre ti**\n\n';

      if (byCategory.fact.length > 0) {
        message += '**Hechos:**\n';
        byCategory.fact.forEach(m => {
          message += `• ${m.content}\n`;
        });
        message += '\n';
      }

      if (byCategory.preference.length > 0) {
        message += '**Preferencias:**\n';
        byCategory.preference.forEach(m => {
          message += `• ${m.content}\n`;
        });
        message += '\n';
      }

      if (byCategory.project.length > 0) {
        message += '**Proyectos:**\n';
        byCategory.project.forEach(m => {
          message += `• ${m.content}\n`;
        });
        message += '\n';
      }

      if (byCategory.context.length > 0) {
        message += '**Contexto:**\n';
        byCategory.context.forEach(m => {
          message += `• ${m.content}\n`;
        });
        message += '\n';
      }

      message += `_Total: ${memories.length} memorias_`;

      await ctx.reply(message);
    } catch (error) {
      logger.error('Error in /memories handler', error);
      await ctx.reply('Error al obtener las memorias. Intenta de nuevo.');
    }
  }

  /**
   * Handle /tasks command (Fase 6)
   */
  async handleTasks(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const prospectives = this.brain.getProspectives(userId);

      if (prospectives.length === 0) {
        await ctx.reply('No tienes intenciones pendientes. ¡Genial! 🎉');
        return;
      }

      // Get user profile to access timezone
      const profile = this.brain.getProfile?.(userId);
      const timezone = profile?.timezone || 'UTC';

      // Import timezone utils (need to fix this import)
      const { getTodayInTimezone } = await import('../../context/timezone-utils.js');

      const todayInUserTz = getTodayInTimezone(timezone);
      const now = new Date();
      const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

      // Helper para formatear fecha relativa
      const formatDateRelative = (date: Date): string => {
        const diffTime = date.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          const daysPast = Math.abs(diffDays);
          return `hace ${daysPast} día${daysPast > 1 ? 's' : ''}`;
        }

        if (diffDays === 0) return 'hoy';
        if (diffDays === 1) return 'mañana';
        if (diffDays === 2) return 'pasado mañana';
        if (diffDays <= 7) return `${dayNames[date.getDay()]} (${diffDays}d)`;

        return `${dayNames[date.getDay()]} ${date.getDate()} ${monthNames[date.getMonth()]}`;
      };

      // Clasificar temporalmente usando la fecha en la zona horaria del usuario
      const overdue = prospectives.filter(
        p => p.dueDate && new Date(p.dueDate) < todayInUserTz
      );

      const todayEnd = new Date(todayInUserTz);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const today = prospectives.filter(p => {
        if (!p.dueDate) return false;
        const dueDate = new Date(p.dueDate);
        return dueDate >= todayInUserTz && dueDate < todayEnd;
      });

      const futureLimit = new Date(todayInUserTz);
      futureLimit.setDate(futureLimit.getDate() + 7);

      const upcoming = prospectives.filter(p => {
        if (!p.dueDate) return false;
        const dueDate = new Date(p.dueDate);
        return dueDate >= todayEnd && dueDate <= futureLimit;
      });

      const future = prospectives.filter(p => {
        if (!p.dueDate) return false;
        const dueDate = new Date(p.dueDate);
        return dueDate > futureLimit;
      });

      const noDate = prospectives.filter(p => !p.dueDate);

      let message = '📋 **Tus Intenciones Pendientes**\n\n';

      // Get today's date in readable format (in user's timezone)
      const todayFormatter = new Intl.DateTimeFormat('es', {
        weekday: 'long',
        day: 'numeric',
        month: '2-digit',
        timeZone: timezone,
      });
      const todayParts = todayFormatter.formatToParts(new Date());
      const todayObj: Record<string, string> = {};
      for (const part of todayParts) {
        if (part.type !== 'literal') {
          todayObj[part.type] = part.value;
        }
      }
      const todayMonthNum = parseInt(todayObj.month);
      const todayFormatted = `${todayObj.weekday} ${todayObj.day} ${monthNames[todayMonthNum - 1]}`;

      if (overdue.length > 0) {
        message += '⚠️ **Vencidas:**\n';
        overdue.forEach(p => {
          const typeEmoji = p.type === 'task' ? '✓' : p.type === 'event' ? '📅' : '🔔';
          message += `${typeEmoji} ${p.content}`;
          if (p.dueDate) {
            const dueDate = new Date(p.dueDate);

            // Obtener día de la semana y fecha en la zona horaria del usuario
            const formatter = new Intl.DateTimeFormat('es', {
              weekday: 'long',
              day: 'numeric',
              month: '2-digit',
              timeZone: timezone,
            });
            const parts = formatter.formatToParts(dueDate);
            const partsObj: Record<string, string> = {};
            for (const part of parts) {
              if (part.type !== 'literal') {
                partsObj[part.type] = part.value;
              }
            }
            const monthNum = parseInt(partsObj.month);
            const dateStr = `${partsObj.weekday} ${partsObj.day} ${monthNames[monthNum - 1]}`;

            const relativeDate = formatDateRelative(dueDate);
            message += ` _(${dateStr}, ${relativeDate}`;
            if (p.dueTime) message += ` ${p.dueTime}`;
            message += `)_`;
          }
          message += `\n_ID: ${p.id.substring(0, 8)}_\n\n`;
        });
      }

      if (today.length > 0) {
        message += `📅 **Hoy (${todayFormatted}):**\n`;
        today.forEach(p => {
          const typeEmoji = p.type === 'task' ? '✓' : p.type === 'event' ? '📅' : '🔔';
          message += `${typeEmoji} ${p.content}`;
          if (p.dueTime) {
            message += ` _(${p.dueTime})_`;
          }
          message += `\n_ID: ${p.id.substring(0, 8)}_\n\n`;
        });
      }

      if (upcoming.length > 0) {
        message += '🔜 **Próximos días:**\n';
        upcoming.forEach(p => {
          const typeEmoji = p.type === 'task' ? '✓' : p.type === 'event' ? '📅' : '🔔';
          const dueDate = new Date(p.dueDate!);

          // Obtener fecha en la zona horaria del usuario
          const formatter = new Intl.DateTimeFormat('es', {
            weekday: 'long',
            day: 'numeric',
            month: '2-digit',
            timeZone: timezone,
          });
          const parts = formatter.formatToParts(dueDate);
          const partsObj: Record<string, string> = {};
          for (const part of parts) {
            if (part.type !== 'literal') {
              partsObj[part.type] = part.value;
            }
          }
          const monthNum = parseInt(partsObj.month);
          const dateStr = `${partsObj.weekday} ${partsObj.day} ${monthNames[monthNum - 1]}`;

          const relativeDate = formatDateRelative(dueDate);
          message += `${typeEmoji} ${p.content}`;
          message += ` _(${dateStr}, ${relativeDate}`;
          if (p.dueTime) {
            message += ` ${p.dueTime}`;
          }
          message += `)_\n_ID: ${p.id.substring(0, 8)}_\n\n`;
        });
      }

      if (future.length > 0) {
        message += '📆 **Más adelante:**\n';
        future.forEach(p => {
          const typeEmoji = p.type === 'task' ? '✓' : p.type === 'event' ? '📅' : '🔔';
          const dueDate = new Date(p.dueDate!);

          // Obtener fecha en la zona horaria del usuario
          const formatter = new Intl.DateTimeFormat('es', {
            weekday: 'long',
            day: 'numeric',
            month: '2-digit',
            timeZone: timezone,
          });
          const parts = formatter.formatToParts(dueDate);
          const partsObj: Record<string, string> = {};
          for (const part of parts) {
            if (part.type !== 'literal') {
              partsObj[part.type] = part.value;
            }
          }
          const monthNum = parseInt(partsObj.month);
          const dateStr = `${partsObj.weekday} ${partsObj.day} ${monthNames[monthNum - 1]}`;

          message += `${typeEmoji} ${p.content}`;
          message += ` _(${dateStr}`;
          if (p.dueTime) {
            message += ` ${p.dueTime}`;
          }
          message += `)_\n_ID: ${p.id.substring(0, 8)}_\n\n`;
        });
      }

      if (noDate.length > 0) {
        message += '📝 **Sin fecha específica:**\n';
        noDate.forEach(p => {
          const typeEmoji = p.type === 'task' ? '✓' : p.type === 'event' ? '📅' : '🔔';
          message += `${typeEmoji} ${p.content}\n_ID: ${p.id.substring(0, 8)}_\n\n`;
        });
      }

      message += `_Total: ${prospectives.length} intenciones_\n\n`;
      message += `💡 Usa /done <ID> para completar, /delete <ID> para eliminar`;

      await ctx.reply(message);
    } catch (error) {
      logger.error('Error in /tasks handler', error);
      await ctx.reply('Error al obtener las intenciones. Intenta de nuevo.');
    }
  }

  /**
   * Handle /done command (Fase 6)
   */
  async handleDone(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const text = (ctx.message as any)?.text || '';
      const parts = text.split(' ');

      if (parts.length < 2) {
        await ctx.reply('Uso: /done <ID>\n\nEjemplo: /done 12345678\n\nUsa /tasks para ver los IDs de tus intenciones.');
        return;
      }

      const query = parts.slice(1).join(' ').trim();

      // Get all prospectives
      const prospectives = this.brain.getProspectives(userId);

      // Find by partial ID or content
      const match = prospectives.find(p =>
        p.id.startsWith(query) ||
        p.content.toLowerCase().includes(query.toLowerCase())
      );

      if (!match) {
        await ctx.reply(`❌ No encontré ninguna intención que coincida con "${query}".\n\nUsa /tasks para ver tus intenciones.`);
        return;
      }

      // Mark as completed
      this.brain.markProspectiveCompleted(userId, match.id);

      await ctx.reply(`✅ ¡Completado!\n\n"${match.content}"\n\n¡Bien hecho! 🎉`);

      logger.info('Prospective marked completed via command', {
        userId,
        prospectiveId: match.id,
        content: match.content
      });

    } catch (error) {
      logger.error('Error in /done handler', error);
      await ctx.reply('Error al marcar como completada. Intenta de nuevo.');
    }
  }

  /**
   * Handle /delete command (Fase 6)
   */
  async handleDelete(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const text = (ctx.message as any)?.text || '';
      const parts = text.split(' ');

      if (parts.length < 2) {
        await ctx.reply('Uso: /delete <ID>\n\nEjemplo: /delete 12345678\n\nUsa /tasks para ver los IDs de tus intenciones.');
        return;
      }

      const query = parts.slice(1).join(' ').trim();

      // Get all prospectives
      const prospectives = this.brain.getProspectives(userId);

      // Find by partial ID or content
      const match = prospectives.find(p =>
        p.id.startsWith(query) ||
        p.content.toLowerCase().includes(query.toLowerCase())
      );

      if (!match) {
        await ctx.reply(`❌ No encontré ninguna intención que coincida con "${query}".\n\nUsa /tasks para ver tus intenciones.`);
        return;
      }

      // Delete prospective
      this.brain.deleteProspective(userId, match.id);

      await ctx.reply(`🗑️ Eliminada:\n\n"${match.content}"`);

      logger.info('Prospective deleted via command', {
        userId,
        prospectiveId: match.id,
        content: match.content
      });

    } catch (error) {
      logger.error('Error in /delete handler', error);
      await ctx.reply('Error al eliminar. Intenta de nuevo.');
    }
  }

  /**
   * Handle /cancel command (Fase 6)
   */
  async handleCancel(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const text = (ctx.message as any)?.text || '';
      const parts = text.split(' ');

      if (parts.length < 2) {
        await ctx.reply('Uso: /cancel <ID>\n\nEjemplo: /cancel 12345678\n\nUsa /tasks para ver los IDs de tus intenciones.');
        return;
      }

      const query = parts.slice(1).join(' ').trim();

      // Get all prospectives
      const prospectives = this.brain.getProspectives(userId);

      // Find by partial ID or content
      const match = prospectives.find(p =>
        p.id.startsWith(query) ||
        p.content.toLowerCase().includes(query.toLowerCase())
      );

      if (!match) {
        await ctx.reply(`❌ No encontré ninguna intención que coincida con "${query}".\n\nUsa /tasks para ver tus intenciones.`);
        return;
      }

      // Mark as cancelled
      this.brain.markProspectiveCancelled(userId, match.id);

      await ctx.reply(`🚫 Cancelado:\n\n"${match.content}"`);

      logger.info('Prospective marked cancelled via command', {
        userId,
        prospectiveId: match.id,
        content: match.content
      });

    } catch (error) {
      logger.error('Error in /cancel handler', error);
      await ctx.reply('Error al cancelar. Intenta de nuevo.');
    }
  }

  /**
   * Handle voice messages
   */
  async handleVoiceMessage(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      // Check if voice message exists
      const voice = (ctx.message as any)?.voice;
      if (!voice) {
        await ctx.reply('No se detectó mensaje de voz.');
        return;
      }

      // Show "recording voice" indicator
      await ctx.sendChatAction('record_voice');
      logger.info(`🎤 Processing voice message from user ${userId}`);

      // Download audio file from Telegram
      const file = await ctx.telegram.getFile(voice.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`;

      logger.debug(`Downloading audio from: ${fileUrl}`);
      const response = await fetch(fileUrl);

      if (!response.ok) {
        throw new Error(`Failed to download audio: ${response.status}`);
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      logger.info(`Audio downloaded: ${audioBuffer.length} bytes, duration: ${voice.duration}s`);

      // Transcribe audio
      const transcription = await this.whisperService.transcribe(audioBuffer, 'voice.ogg');

      // Check if transcription failed
      if (transcription.startsWith('[')) {
        await ctx.reply(transcription); // Send error message
        return;
      }

      if (!transcription || transcription.trim() === '') {
        await ctx.reply('❌ No se pudo transcribir el audio. Intenta de nuevo.');
        return;
      }

      logger.info(`Transcription: "${transcription}"`);

      // Show "typing" indicator (user will see bot is processing)
      await ctx.sendChatAction('typing');

      // Process transcription as regular text message
      const botResponse = await this.brain.processMessage(userId, transcription);

      // Check if response requires tool confirmation
      if (typeof botResponse === 'object' && botResponse.requiresConfirmation) {
        await this.sendToolConfirmation(ctx, botResponse.request);
        return;
      }

      // Format and send response
      const formatted = TelegramFormatter.toTelegramMarkdown(botResponse as string);
      const chunks = TelegramFormatter.splitMessage(formatted);

      for (const chunk of chunks) {
        try {
          await ctx.reply(chunk, { parse_mode: 'MarkdownV2' });
        } catch (error: any) {
          if (error?.response?.error_code === 400) {
            logger.warn('MarkdownV2 parse error, falling back to plain text');
            const plainChunk = TelegramFormatter.toPlainText(chunk);
            await ctx.reply(plainChunk);
          } else {
            throw error;
          }
        }
      }

    } catch (error) {
      logger.error('Error handling voice message', error);
      await ctx.reply('Lo siento, ocurrió un error al procesar el audio. Intenta de nuevo.');
    }
  }

  /**
   * Handle regular text messages
   */
  async handleMessage(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    const text = (ctx.message as any)?.text;

    if (!userId || !text) return;

    try {
      // Check if user needs onboarding
      if (this.onboardingService.needsOnboarding(userId)) {
        const result = await this.onboardingService.handleMessage(userId, text);

        await ctx.reply(result.response);

        // If onboarding complete, show welcome message
        if (result.isComplete) {
          await ctx.reply('Puedes usar /help para ver los comandos disponibles.');
        }

        return;
      }

      // Show typing indicator
      await ctx.sendChatAction('typing');

      // Check if user is trying to clear a stuck pending tool request
      if (text.toLowerCase().includes('cancel') || text.toLowerCase().includes('cancelar')) {
        const store = this.brain.getToolActionsStore();
        const pendingRequest = store.getPendingRequest(userId);
        if (pendingRequest) {
          store.rejectRequest(userId, pendingRequest.id);
          await ctx.reply('🚫 Solicitud de herramienta cancelada. Ahora puedo procesar nuevas solicitudes.');
          return;
        }
      }

      // Process message with brain
      const response = await this.brain.processMessage(userId, text);

      // NUEVO: Check if response requires tool confirmation
      if (typeof response === 'object' && response.requiresConfirmation) {
        await this.sendToolConfirmation(ctx, response.request);
        return;
      }

      // Translate to Telegram MarkdownV2
      const formatted = TelegramFormatter.toTelegramMarkdown(response as string);

      // Split long messages if needed
      const chunks = TelegramFormatter.splitMessage(formatted);

      // Send response chunks with MarkdownV2
      for (const chunk of chunks) {
        try {
          await ctx.reply(chunk, { parse_mode: 'MarkdownV2' });
        } catch (error: any) {
          // Fallback: if MarkdownV2 fails, send as plain text
          if (error?.response?.error_code === 400) {
            logger.warn('MarkdownV2 parse error, falling back to plain text', { error: error?.response?.description });
            const plainChunk = TelegramFormatter.toPlainText(chunk);
            await ctx.reply(plainChunk);
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      logger.error('Error handling message', error);
      await ctx.reply('Lo siento, ocurrió un error al procesar tu mensaje. Intenta de nuevo.');
    }
  }

  /**
   * Send tool confirmation request with inline buttons (Fase 7)
   */
  private async sendToolConfirmation(ctx: Context, request: ToolActionRequest): Promise<void> {
    const actionNames: Record<string, string> = {
      read_file: 'Leer archivo',
      write_file: 'Escribir archivo',
      list_directory: 'Listar directorio',
      execute_command: 'Ejecutar comando',
      web_search: 'Búsqueda web'
    };

    const actionName = actionNames[request.action] || request.action;

    const message =
      `🔧 **Solicitud de Herramienta**\n\n` +
      `**Acción:** ${actionName}\n` +
      `**Recurso:** \`${request.targetResource}\`\n\n` +
      `**Descripción:**\n${request.description}\n\n` +
      `¿Deseas ejecutar esta acción?`;

    try {
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Aprobar', `tool_approve:${request.id}`),
            Markup.button.callback('🚫 Cancelar', `tool_reject:${request.id}`)
          ]
        ])
      });
    } catch (error) {
      logger.error('Error sending tool confirmation', { error });
      // Fallback sin markdown
      await ctx.reply(
        `🔧 Solicitud de Herramienta\n\n` +
        `Acción: ${actionName}\n` +
        `Recurso: ${request.targetResource}\n\n` +
        `Descripción:\n${request.description}\n\n` +
        `¿Deseas ejecutar esta acción?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Aprobar', `tool_approve:${request.id}`),
            Markup.button.callback('🚫 Cancelar', `tool_reject:${request.id}`)
          ]
        ])
      );
    }
  }

  /**
   * Handle callback query from inline buttons (Fase 7)
   */
  async handleCallback(ctx: Context): Promise<void> {
    const callbackQuery = (ctx as any).callbackQuery;
    const userId = ctx.from?.id.toString();

    if (!userId || !callbackQuery?.data) {
      await ctx.answerCbQuery('Error: datos inválidos');
      return;
    }

    const data = callbackQuery.data as string;
    const [action, requestId] = data.split(':');

    try {
      if (action === 'tool_approve') {
        await this.handleToolApproval(ctx, userId, requestId);
      } else if (action === 'tool_reject') {
        await this.handleToolRejection(ctx, userId, requestId);
      } else {
        await ctx.answerCbQuery('Acción desconocida');
      }
    } catch (error: any) {
      logger.error('Error handling callback', { error, action, requestId });
      await ctx.answerCbQuery('Error procesando la acción');
      await ctx.reply(`❌ Error: ${error.message || 'Error desconocido'}`);
    }
  }

  /**
   * Handle tool approval (Fase 7)
   */
  private async handleToolApproval(ctx: Context, userId: string, requestId: string): Promise<void> {
    const store = this.brain.getToolActionsStore();
    const executor = this.brain.getToolExecutor();

    // Get request
    const request = store.getRequest(requestId);
    if (!request) {
      await ctx.answerCbQuery('Solicitud no encontrada');
      return;
    }

    // Approve request
    store.approveRequest(userId, requestId);

    // Edit message to show approval
    try {
      await ctx.editMessageText(
        `✅ **Aprobado**\n\n${request.description}\n\n_Ejecutando..._`,
        { parse_mode: 'Markdown' }
      );
    } catch {
      // Fallback sin markdown
      await ctx.editMessageText(
        `✅ Aprobado\n\n${request.description}\n\nEjecutando...`
      );
    }

    await ctx.answerCbQuery('Ejecutando...');

    // Execute tool
    const startTime = Date.now();
    const result = await executor.execute(
      request.action,
      request.targetResource,
      request.parameters
    );

    // Mark as executed
    store.markExecuted(userId, requestId, result.output);

    // Send result
    if (result.success) {
      const resultMessage = `✅ **Ejecutado exitosamente**\n\nDuración: ${result.durationMs}ms\n\n\`\`\`\n${result.output}\n\`\`\``;

      try {
        await ctx.reply(resultMessage, { parse_mode: 'Markdown' });
      } catch {
        // Fallback sin markdown
        await ctx.reply(`✅ Ejecutado exitosamente\n\nDuración: ${result.durationMs}ms\n\n${result.output}`);
      }

      // Process result with LLM for contextual explanation
      await ctx.sendChatAction('typing');

      const contextualResponse = await this.brain.processMessage(
        userId,
        `[RESULTADO DE HERRAMIENTA]\nAcción: ${request.action}\nResultado:\n${result.output}\n\nExplica brevemente qué obtuvimos y cómo responde a mi solicitud original.`
      );

      // Only format and send if it's a string response (not another tool request)
      if (typeof contextualResponse === 'string') {
        const formatted = TelegramFormatter.toTelegramMarkdown(contextualResponse);

        try {
          await ctx.reply(formatted, { parse_mode: 'MarkdownV2' });
        } catch {
          await ctx.reply(TelegramFormatter.toPlainText(formatted));
        }
      }
    } else {
      const errorMessage = `❌ **Error ejecutando**\n\n${result.output}`;

      try {
        await ctx.reply(errorMessage, { parse_mode: 'Markdown' });
      } catch {
        await ctx.reply(`❌ Error ejecutando\n\n${result.output}`);
      }
    }
  }

  /**
   * Handle tool rejection (Fase 7)
   */
  private async handleToolRejection(ctx: Context, userId: string, requestId: string): Promise<void> {
    const store = this.brain.getToolActionsStore();

    // Get request
    const request = store.getRequest(requestId);
    if (!request) {
      await ctx.answerCbQuery('Solicitud no encontrada');
      return;
    }

    // Reject request
    store.rejectRequest(userId, requestId);

    // Edit message to show rejection
    try {
      await ctx.editMessageText(
        `🚫 **Cancelado**\n\n${request.description}\n\n_No se ejecutó ninguna acción._`,
        { parse_mode: 'Markdown' }
      );
    } catch {
      // Fallback sin markdown
      await ctx.editMessageText(
        `🚫 Cancelado\n\n${request.description}\n\nNo se ejecutó ninguna acción.`
      );
    }

    await ctx.answerCbQuery('Cancelado');
  }

  /**
   * Handle photo uploads (Fase 8)
   */
  async handlePhoto(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      // Get photo of best resolution
      const photos = (ctx.message as any)?.photo;
      if (!photos || photos.length === 0) {
        await ctx.reply('No se pudo procesar la imagen.');
        return;
      }

      const bestPhoto = photos[photos.length - 1]; // Last one is highest quality

      // Download and save
      await ctx.sendChatAction('typing');
      const upload = await this.fileUploadManager.downloadAndSave(
        userId,
        bestPhoto.file_id,
        `image_${Date.now()}.jpg`,
        'photo',
        ctx.telegram,
        {
          width: bestPhoto.width,
          height: bestPhoto.height,
          mimeType: 'image/jpeg'
        }
      );

      logger.info('Photo uploaded', {
        userId,
        filename: upload.filename,
        size: upload.size
      });

      // Get caption if exists
      const caption = (ctx.message as any)?.caption;

      if (caption) {
        // User wants to do something with the image
        await ctx.sendChatAction('typing');

        const response = await this.brain.processMessage(userId, caption, {
          imageUrl: upload.path
        });

        // Handle tool confirmation or normal response
        if (typeof response === 'object' && response.requiresConfirmation) {
          await this.sendToolConfirmation(ctx, response.request);
        } else {
          const formatted = TelegramFormatter.toTelegramMarkdown(response as string);
          await ctx.reply(formatted, { parse_mode: 'MarkdownV2' });
        }
      } else {
        // No caption, just confirm save
        const width = upload.metadata?.width || '?';
        const height = upload.metadata?.height || '?';
        const sizeKb = (upload.size / 1024).toFixed(1);

        await ctx.reply(
          `✅ Imagen guardada\n\n` +
            `📁 Ubicación: \`uploads/\`\n` +
            `📊 Tamaño: ${sizeKb} KB\n` +
            `🖼️ Dimensiones: ${width}x${height}px\n\n` +
            `¿Qué quieres hacer?\n` +
            `• Analizar / describir\n` +
            `• Extraer texto (OCR)\n` +
            `• Mover a otra carpeta`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('Error handling photo', error);
      await ctx.reply('Error procesando la imagen. Intenta de nuevo.');
    }
  }

  /**
   * Handle document uploads (Fase 8)
   */
  async handleDocument(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const document = (ctx.message as any)?.document;
      if (!document) {
        await ctx.reply('No se pudo procesar el documento.');
        return;
      }

      // Validate size (max 20MB)
      if (document.file_size > 20 * 1024 * 1024) {
        await ctx.reply('❌ Archivo muy grande (máx 20MB)');
        return;
      }

      // Download and save
      await ctx.sendChatAction('upload_document');
      const upload = await this.fileUploadManager.downloadAndSave(
        userId,
        document.file_id,
        document.file_name,
        'document',
        ctx.telegram,
        {
          mimeType: document.mime_type
        }
      );

      logger.info('Document uploaded', {
        userId,
        filename: upload.filename,
        size: upload.size,
        mimeType: upload.mimeType
      });

      const caption = (ctx.message as any)?.caption;

      if (caption) {
        // Process with brain (context about the document)
        await ctx.sendChatAction('typing');

        const response = await this.brain.processMessage(userId, caption, {
          documentPath: upload.path
        });

        if (typeof response === 'object' && response.requiresConfirmation) {
          await this.sendToolConfirmation(ctx, response.request);
        } else {
          const formatted = TelegramFormatter.toTelegramMarkdown(response as string);
          await ctx.reply(formatted, { parse_mode: 'MarkdownV2' });
        }
      } else {
        const sizeKb = (document.file_size / 1024).toFixed(1);

        await ctx.reply(
          `✅ Documento guardado\n\n` +
            `📄 Nombre: \`${document.file_name}\`\n` +
            `📊 Tamaño: ${sizeKb} KB\n` +
            `🏷️ Tipo: ${document.mime_type}\n\n` +
            `¿Qué quieres hacer?\n` +
            `• Mover a otra carpeta\n` +
            `• Dejar aquí`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      logger.error('Error handling document', error);
      await ctx.reply('Error procesando el documento. Intenta de nuevo.');
    }
  }

  /**
   * Handle video uploads (Fase 8)
   */
  async handleVideo(ctx: Context): Promise<void> {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    try {
      const video = (ctx.message as any)?.video;
      if (!video) {
        await ctx.reply('No se pudo procesar el video.');
        return;
      }

      // Validate size
      if (video.file_size > 20 * 1024 * 1024) {
        await ctx.reply('❌ Video muy grande (máx 20MB)');
        return;
      }

      await ctx.sendChatAction('upload_video');
      const upload = await this.fileUploadManager.downloadAndSave(
        userId,
        video.file_id,
        `video_${Date.now()}.mp4`,
        'video',
        ctx.telegram,
        {
          width: video.width,
          height: video.height,
          duration: video.duration,
          mimeType: video.mime_type
        }
      );

      logger.info('Video uploaded', {
        userId,
        filename: upload.filename,
        size: upload.size,
        duration: upload.metadata?.duration
      });

      const sizeMb = (upload.size / 1024 / 1024).toFixed(1);
      const duration = upload.metadata?.duration || '?';

      await ctx.reply(
        `✅ Video guardado\n\n` +
          `📁 Ubicación: \`uploads/\`\n` +
          `📊 Tamaño: ${sizeMb} MB\n` +
          `⏱️ Duración: ${duration}s`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Error handling video', error);
      await ctx.reply('Error procesando el video. Intenta de nuevo.');
    }
  }

  /**
   * Handle errors
   */
  async handleError(error: any, ctx: Context): Promise<void> {
    logger.error('Telegram bot error', error);

    try {
      await ctx.reply('Lo siento, ocurrió un error inesperado. Por favor intenta de nuevo.');
    } catch (e) {
      logger.error('Failed to send error message', e);
    }
  }

  /**
   * PASO 11: Task Daemon Command Handlers
   */

  /**
   * Delegate to TaskDaemonHandlers: /queue command
   */
  async handleQueue(ctx: Context): Promise<void> {
    return this.taskDaemonHandlers.handleQueue(ctx);
  }

  /**
   * Delegate to TaskDaemonHandlers: /project command
   */
  async handleProject(ctx: Context): Promise<void> {
    return this.taskDaemonHandlers.handleProject(ctx);
  }

  /**
   * Delegate to TaskDaemonHandlers: /daemon command
   */
  async handleDaemonStatus(ctx: Context): Promise<void> {
    return this.taskDaemonHandlers.handleDaemon(ctx);
  }

  /**
   * Handle /help command: Show all available commands
   */
  async handleHelp(ctx: Context): Promise<void> {
    const helpMessage = `
🤖 *Comandos Disponibles*

*📱 Básicos*
/start - Iniciar el asistente
/help - Mostrar esta ayuda
/profile - Ver tu perfil
/reset - Reiniciar conversación

*🧠 Memoria & Contexto*
/memories - Ver memorias prospectivas
/tasks - Ver tareas pendientes
/done {id} - Marcar tarea como completada
/delete {id} - Eliminar tarea
/cancel - Cancelar acción en curso
/stats - Estadísticas de uso

*🔄 Task Daemon (Autonomía)*
/queue list - Ver tareas en cola
/queue add {skill} - Encolar tarea
/queue status {id} - Estado de tarea
/queue cancel {id} - Cancelar tarea

/project list - Ver proyectos
/project start {nombre} - Crear proyecto
/project status {id} - Estado del proyecto
/project pause {id} - Pausar proyecto
/project resume {id} - Reanudar proyecto

/daemon - Estado del daemon autónomo

*💬 Interacción Natural*
• Envía mensajes de texto
• Envía mensajes de voz
• Sube imágenes (con descripción opcional)
• Sube documentos/videos

El asistente aprende de tus interacciones y puede ejecutar tareas de forma autónoma basándose en tus patrones y necesidades.
`;

    await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
  }
}
