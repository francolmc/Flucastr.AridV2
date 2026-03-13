/**
 * Environment Configuration Loader & Validator
 */

import dotenv from 'dotenv';
import { Config } from './types.js';
import { AppError } from '../utils/errors.js';

dotenv.config();

export function loadConfig(): Config {
  // Telegram
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!telegramBotToken) {
    throw new AppError('TELEGRAM_BOT_TOKEN is required');
  }

  const allowedUserIds = process.env.TELEGRAM_ALLOWED_USER_IDS?.split(',').map(id => id.trim()) || [];
  if (allowedUserIds.length === 0) {
    throw new AppError('TELEGRAM_ALLOWED_USER_IDS is required (comma-separated list)');
  }

  // LLM Mode
  const llmMode = (process.env.LLM_MODE || 'hybrid') as 'hybrid' | 'single';
  if (!['hybrid', 'single'].includes(llmMode)) {
    throw new AppError('LLM_MODE must be "hybrid" or "single"');
  }

  const providerConversation = process.env.LLM_PROVIDER_CONVERSATION || 'gemini';
  const providerReasoning = process.env.LLM_PROVIDER_REASONING || 'anthropic';
  const providerAnalyzer = process.env.LLM_PROVIDER_ANALYZER || 'gemini';

  // Anthropic
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';
  const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

  // Gemini
  const geminiApiKey = process.env.GEMINI_API_KEY || '';
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';

  // Ollama
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2:3b';

  // Validate at least one LLM provider is configured
  if (!anthropicApiKey && !geminiApiKey && !ollamaBaseUrl) {
    throw new AppError('At least one LLM provider must be configured');
  }

  // Storage
  const storePath = process.env.STORE_PATH || './data/store.json';
  // User data directory (workspace/) - where PROFILE.md, skills, docs live
  const userDataPath = process.env.WORKSPACE_PATH || './workspace';

  // Whisper
  const whisperUrl = process.env.WHISPER_URL || 'http://localhost:9000';
  const whisperModel = process.env.WHISPER_MODEL || 'base';
  const whisperLanguage = process.env.WHISPER_LANGUAGE || 'es';

  // Tools - Sandbox root for file operations  
  const toolsSandboxRoot = process.env.TOOLS_WORKSPACE_PATH || process.cwd();
  const tavilyApiKey = process.env.TAVILY_API_KEY;

  // Skills Encryption (Fase 9)
  const storageEncryptionKey = process.env.STORAGE_ENCRYPTION_KEY;
  if (!storageEncryptionKey) {
    throw new AppError(
      'STORAGE_ENCRYPTION_KEY is required for skill credentials encryption. Generate with: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  return {
    telegram: {
      botToken: telegramBotToken,
      allowedUserIds,
    },
    llm: {
      mode: llmMode,
      providerConversation,
      providerReasoning,
      providerAnalyzer,
      anthropic: {
        apiKey: anthropicApiKey,
        model: anthropicModel,
      },
      gemini: {
        apiKey: geminiApiKey,
        model: geminiModel,
      },
      ollama: {
        baseUrl: ollamaBaseUrl,
        model: ollamaModel,
      },
    },
    storage: {
      storePath,
      userDataPath,
    },
    whisper: {
      url: whisperUrl,
      model: whisperModel,
      language: whisperLanguage,
    },
    tools: {
      toolsSandboxRoot,
      tavilyApiKey,
    },
    skills: {
      encryptionKey: storageEncryptionKey,
    },
  };
}
