/**
 * Telegram Message Handlers
 */

import { Context } from 'telegraf';
import { Brain } from '../../brain/brain.js';
import { OnboardingService } from '../../onboarding/onboarding.service.js';
import { ProfileStore } from '../../storage/profile.store.js';
import { TelegramFormatter } from './formatter.js';
import { WhisperService } from '../../transcription/whisper.service.js';
import { logger } from '../../utils/logger.js';

export class TelegramHandlers {
  private brain: Brain;
  private onboardingService: OnboardingService;
  private profileStore: ProfileStore;
  private whisperService: WhisperService;

  constructor(brain: Brain, onboardingService: OnboardingService, whisperService: WhisperService) {
    this.brain = brain;
    this.onboardingService = onboardingService;
    this.profileStore = new ProfileStore();
    this.whisperService = whisperService;
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

      // Format and send response
      const formatted = TelegramFormatter.toTelegramMarkdown(botResponse);
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

      // Process message with brain
      const response = await this.brain.processMessage(userId, text);

      // Translate to Telegram MarkdownV2
      const formatted = TelegramFormatter.toTelegramMarkdown(response);

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
}
