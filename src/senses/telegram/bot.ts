/**
 * Telegram Bot
 * Main bot instance and setup
 */

import { Telegraf } from 'telegraf';
import { TelegramHandlers } from './handlers.js';
import { Brain } from '../../brain/brain.js';
import { OnboardingService } from '../../onboarding/onboarding.service.js';
import { WhisperService } from '../../transcription/whisper.service.js';
import { TelegramConfig, WhisperConfig } from '../../config/types.js';
import { logger } from '../../utils/logger.js';
import { TelegramError } from '../../utils/errors.js';

export class TelegramBot {
  private bot: Telegraf;
  private handlers: TelegramHandlers;
  private allowedUserIds: Set<string>;

  constructor(
    config: TelegramConfig,
    brain: Brain,
    onboardingService: OnboardingService,
    whisperConfig: WhisperConfig
  ) {
    this.bot = new Telegraf(config.botToken);

    // Initialize WhisperService
    const whisperService = new WhisperService(
      whisperConfig.url,
      whisperConfig.model,
      whisperConfig.language
    );

    this.handlers = new TelegramHandlers(brain, onboardingService, whisperService);
    this.allowedUserIds = new Set(config.allowedUserIds);

    this.setupMiddleware();
    this.setupHandlers();

    logger.info('Telegram bot initialized', {
      allowedUsers: config.allowedUserIds.length
    });
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // User allowlist middleware
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id.toString();

      if (!userId || !this.allowedUserIds.has(userId)) {
        logger.warn('Unauthorized access attempt', { userId });
        await ctx.reply('Lo siento, no tienes acceso a este bot.');
        return;
      }

      await next();
    });

    // Logging middleware
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id.toString();
      const username = ctx.from?.username;
      const messageType = ctx.message ? 'message' : ctx.callbackQuery ? 'callback' : 'unknown';

      logger.debug('Incoming update', {
        userId,
        username,
        messageType
      });

      await next();
    });
  }

  /**
   * Setup command and message handlers
   */
  private setupHandlers(): void {
    // Commands
    this.bot.command('start', (ctx) => this.handlers.handleStart(ctx));
    this.bot.command('reset', (ctx) => this.handlers.handleReset(ctx));
    this.bot.command('profile', (ctx) => this.handlers.handleProfile(ctx));
    this.bot.command('memories', (ctx) => this.handlers.handleMemories(ctx));
    this.bot.command('tasks', (ctx) => this.handlers.handleTasks(ctx));
    this.bot.command('done', (ctx) => this.handlers.handleDone(ctx));
    this.bot.command('delete', (ctx) => this.handlers.handleDelete(ctx));
    this.bot.command('cancel', (ctx) => this.handlers.handleCancel(ctx));
    this.bot.command('stats', (ctx) => this.handlers.handleStats(ctx));

    // Text messages
    this.bot.on('text', (ctx) => this.handlers.handleMessage(ctx));

    // Voice messages
    this.bot.on('voice', (ctx) => this.handlers.handleVoiceMessage(ctx));

    // Callback queries (inline buttons) - Fase 7
    this.bot.on('callback_query', (ctx) => this.handlers.handleCallback(ctx));

    // Error handler
    this.bot.catch((error, ctx) => this.handlers.handleError(error, ctx));
  }

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    try {
      logger.info('Starting Telegram bot...');

      // Start polling
      await this.bot.launch();

      logger.info('Telegram bot started successfully');

      // Enable graceful stop
      process.once('SIGINT', () => this.stop('SIGINT'));
      process.once('SIGTERM', () => this.stop('SIGTERM'));
    } catch (error) {
      logger.error('Failed to start Telegram bot', error);
      throw new TelegramError(`Failed to start bot: ${error}`);
    }
  }

  /**
   * Stop the bot
   */
  async stop(signal?: string): Promise<void> {
    logger.info('Stopping Telegram bot', { signal });

    try {
      await this.bot.stop(signal);
      logger.info('Telegram bot stopped');
    } catch (error) {
      logger.error('Error stopping bot', error);
    }
  }

  /**
   * Get bot instance (for advanced usage)
   */
  getInstance(): Telegraf {
    return this.bot;
  }
}
