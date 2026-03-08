/**
 * Configuration Types for AridV2
 */

export interface Config {
  telegram: TelegramConfig;
  llm: LLMConfig;
  storage: StorageConfig;
}

export interface TelegramConfig {
  botToken: string;
  allowedUserIds: string[];
}

export interface LLMConfig {
  mode: 'hybrid' | 'single';
  providerConversation: string;
  providerReasoning: string;
  anthropic: {
    apiKey: string;
    model: string;
  };
  gemini: {
    apiKey: string;
    model: string;
  };
  ollama: {
    baseUrl: string;
    model: string;
  };
}

export interface StorageConfig {
  storePath: string;
  workspacePath: string;
}

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface IntentAnalysis {
  needsReasoning: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  reasoning: string;
  confidence: number;
}

export interface ConversationMessage {
  id?: number;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  modelUsed?: string;
  createdAt?: Date;
}

export interface Profile {
  userId: string;
  agentName: string;
  agentTone?: string;
  personality?: string;
  userName?: string;
  preferences?: string;
  profileMarkdown?: string;
  updatedAt?: Date;
}

export interface OnboardingState {
  userId: string;
  isCompleted: boolean;
  currentStep: number;
  answers?: Record<string, string>;
  startedAt?: Date;
  completedAt?: Date;
}

export interface TokenStats {
  userId: string;
  sessionDate: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  messageCount: number;
}
