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

/**
 * Prospective Memory - Memoria Prospectiva (Intenciones Futuras)
 */
export type ProspectiveType = 'task' | 'event' | 'reminder';

export type ProspectiveCategory =
  | 'personal'   // Vida personal (familia, hobbies, personal care)
  | 'work'       // Trabajo (reuniones, proyectos, deadlines)
  | 'health'     // Salud (ejercicio, médico, medicación)
  | 'social';    // Social (eventos, amigos, cumpleaños)

export type ProspectiveStatus =
  | 'pending'    // Aún no vencida
  | 'overdue'    // Pasó la fecha y no se completó
  | 'completed'  // Marcada como completada
  | 'cancelled'; // Cancelada

/**
 * RecurrenceRule - Regla de recurrencia para tareas/eventos repetitivos
 */
export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;              // Cada cuántos (ej: cada 2 días = interval: 2)
  daysOfWeek?: number[];         // [0-6] donde 0=domingo (para weekly)
  dayOfMonth?: number;           // 1-31 (para monthly)
  endDate?: Date;                // Cuándo termina la recurrencia (opcional)
  occurrences?: number;          // O después de N ocurrencias
}

/**
 * ProspectiveMemory - Intención futura del usuario
 */
export interface ProspectiveMemory {
  id: string;                    // UUID
  userId: string;                // Usuario owner

  // Clasificación
  type: ProspectiveType;         // 'task' | 'event' | 'reminder'
  category: ProspectiveCategory; // 'personal' | 'work' | 'health' | 'social'

  // Contenido
  content: string;               // Descripción natural (1-2 líneas)
  context?: string;              // Contexto adicional (dónde, con quién, por qué)

  // Temporal
  dueDate?: Date;                // Cuándo debe hacerse/recordarse
  dueTime?: string;              // Hora específica (HH:MM) o null si todo el día
  isAllDay: boolean;             // True si es evento de día completo

  // Recurrencia
  recurrence?: RecurrenceRule;   // null si es one-time
  nextOccurrence?: Date;         // Próxima ocurrencia (calculado)

  // Estado
  status: ProspectiveStatus;     // 'pending' | 'completed' | 'cancelled' | 'overdue'
  priority: number;              // 0.0-1.0 (similar a importance en Memory)

  // Metadata
  source: string;                // "conversation-{timestamp}"
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  lastMentioned?: Date;          // Última vez que el asistente lo mencionó
  mentionCount: number;          // Cuántas veces se mencionó
}
