/**
 * Custom Error Classes
 */

export class AppError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'AppError';
  }
}

export class LLMError extends AppError {
  constructor(message: string, public provider?: string) {
    super(message, 'LLM_ERROR');
    this.name = 'LLMError';
  }
}

export class StorageError extends AppError {
  constructor(message: string) {
    super(message, 'STORAGE_ERROR');
    this.name = 'StorageError';
  }
}

export class BrainError extends AppError {
  constructor(message: string) {
    super(message, 'BRAIN_ERROR');
    this.name = 'BrainError';
  }
}

export class OnboardingError extends AppError {
  constructor(message: string) {
    super(message, 'ONBOARDING_ERROR');
    this.name = 'OnboardingError';
  }
}

export class TelegramError extends AppError {
  constructor(message: string) {
    super(message, 'TELEGRAM_ERROR');
    this.name = 'TelegramError';
  }
}

export class ToolExecutionError extends AppError {
  constructor(message: string) {
    super(message, 'TOOL_EXECUTION_ERROR');
    this.name = 'ToolExecutionError';
  }
}
