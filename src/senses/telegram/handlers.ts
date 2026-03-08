/**
 * Telegram Message Handlers
 */

import { Context } from 'telegraf';
import { Brain } from '../../brain/brain.js';
import { OnboardingService } from '../../onboarding/onboarding.service.js';
import { ProfileStore } from '../../storage/profile.store.js';
import { TelegramFormatter } from './formatter.js';
import { logger } from '../../utils/logger.js';

export class TelegramHandlers {
  private brain: Brain;
  private onboardingService: OnboardingService;
  private profileStore: ProfileStore;

  constructor(brain: Brain, onboardingService: OnboardingService) {
    this.brain = brain;
    this.onboardingService = onboardingService;
    this.profileStore = new ProfileStore();
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

      // Split long messages if needed
      const chunks = TelegramFormatter.splitMessage(response);

      // Send response chunks
      for (const chunk of chunks) {
        // Use plain text to avoid markdown issues
        await ctx.reply(chunk);
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
