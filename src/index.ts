/**
 * AridV2 - Entry Point
 * Asistente Conversacional Minimalista
 */

import { loadConfig } from './config/env.js';
import { DB } from './storage/db.js';
import { LLMFactory } from './llm/factory.js';
import { Brain } from './brain/brain.js';
import { OnboardingService } from './onboarding/onboarding.service.js';
import { TelegramBot } from './senses/telegram/bot.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    logger.info('Starting AridV2...');

    // 1. Load configuration
    const config = loadConfig();
    logger.info('Configuration loaded');

    // 2. Initialize store
    await DB.initialize(config.storage.storePath);
    logger.info('Store initialized');

    // 3. Initialize LLM providers
    const llmFactory = new LLMFactory(config.llm);
    const providers = llmFactory.initialize();
    logger.info('LLM providers initialized', {
      conversation: providers.conversation.getModel(),
      reasoning: providers.reasoning.getModel(),
      analyzer: providers.analyzer.getModel()
    });

    // 4. Initialize Brain
    const brain = new Brain({
      conversationProvider: providers.conversation,
      reasoningProvider: providers.reasoning,
      analyzerProvider: providers.analyzer,
      workspacePath: config.tools.workspacePath,
      tavilyApiKey: config.tools.tavilyApiKey
    });
    logger.info('Brain initialized');

    // 5. Initialize Onboarding Service
    const onboardingService = new OnboardingService(config.storage.workspacePath);
    logger.info('Onboarding service initialized');

    // 6. Initialize Telegram Bot (with storage config for Fase 8)
    const telegramBot = new TelegramBot(
      config.telegram,
      brain,
      onboardingService,
      config.whisper,
      config.storage
    );
    logger.info('Telegram bot initialized');

    // 7. Start bot
    await telegramBot.start();

    logger.info('AridV2 is running! 🚀');
  } catch (error) {
    logger.error('Failed to start AridV2', error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

// Start application
main();
