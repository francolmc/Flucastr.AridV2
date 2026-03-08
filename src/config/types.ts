/**
 * Configuration Types for AridV2
 */

export interface Config {
  telegram: TelegramConfig;
  llm: LLMConfig;
  storage: StorageConfig;
  whisper: WhisperConfig;
}

export interface TelegramConfig {
  botToken: string;
  allowedUserIds: string[];
}

export interface LLMConfig {
  mode: 'hybrid' | 'single';
  providerConversation: string;
  providerReasoning: string;
  providerAnalyzer: string;
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

export interface WhisperConfig {
  url: string;
  model: string;
  language: string;
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
  // ✨ Contexto espacial/temporal (Fase 3)
  city?: string;         // "Buenos Aires"
  country?: string;      // "Argentina"
  timezone?: string;     // "America/Argentina/Buenos_Aires"
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

/**
 * Memory Category - Tipos de memorias que el asistente puede almacenar
 */
export type MemoryCategory = 'fact' | 'preference' | 'project' | 'context';

/**
 * Memory - Información aprendida sobre el usuario
 */
export interface Memory {
  id: string;                    // UUID de la memoria
  userId: string;                // ID del usuario
  category: MemoryCategory;      // Categoría de la memoria
  content: string;               // Contenido descriptivo de la memoria
  source: string;                // Origen (conversationId, timestamp)
  importance: number;            // Score 0.0-1.0 para priorización
  createdAt: Date;              // Cuándo se creó
  lastAccessed?: Date;          // Última vez que se usó
  accessCount: number;          // Cuántas veces se ha usado
}
