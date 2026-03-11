/**
 * Configuration Types for AridV2
 */

export interface Config {
  telegram: TelegramConfig;
  llm: LLMConfig;
  storage: StorageConfig;
  whisper: WhisperConfig;
  tools: ToolsConfig;
  skills: SkillsConfig;  // Fase 9
}

export interface SkillsConfig {
  encryptionKey: string;  // Master key para encriptación de credentials
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

export interface ToolsConfig {
  workspacePath: string;
  tavilyApiKey?: string;
}

/**
 * Content block for multimodal messages (Fase 8)
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: ImageSource };

/**
 * Image source for vision capabilities (Fase 8)
 */
export type ImageSource =
  | { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string }
  | { type: 'url'; url: string };

/**
 * LLM Message - Now supports multimodal content (Fase 8)
 * Backward compatible: content can be string or ContentBlock[]
 */
export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];  // ← Extended for multimodal
}

export interface LLMResponse {
  content: string;
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  toolCalls?: Array<{
    id: string;
    name: string;
    input: any;
  }>;
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

/**
 * Uploaded File metadata (Fase 8)
 */
export type FileType = 'photo' | 'document' | 'video' | 'audio';

export interface UploadedFile {
  id: string;                    // UUID
  userId: string;                // Usuario owner
  filename: string;              // Nombre original del archivo
  path: string;                  // Ruta en disco: uploads/[userId]/file.ext
  type: FileType;                // Tipo de archivo
  mimeType: string;              // application/pdf, image/jpeg, etc.
  size: number;                  // Tamaño en bytes
  uploadedAt: Date;              // Cuándo se subió
  metadata?: {
    width?: number;              // Para imágenes
    height?: number;             // Para imágenes
    duration?: number;           // Para videos/audio (en segundos)
    thumbnailPath?: string;      // Para videos
  };
}

/**
 * Skill Metadata - YAML frontmatter de SKILL.md (Fase 9)
 */
export interface SkillMetadata {
  id: string;                    // UUID interno
  userId: string;                // Usuario owner
  name: string;                  // skill-name (lowercase, hyphens)
  description: string;           // Breve descripción (cuándo usar)
  requiredEnv?: string[];        // Env vars requeridas ["GITHUB_TOKEN"]
  createdAt: Date;
  updatedAt: Date;
  lastUsed?: Date;
  usageCount: number;            // Cuántas veces se ha usado
}

/**
 * Skill - Recurso completo con instrucciones (Fase 9)
 */
export interface Skill {
  metadata: SkillMetadata;
  content: string;               // Body de SKILL.md (markdown)
  filePath: string;              // workspace/skills/{userId}/{name}/SKILL.md
}

/**
 * Skill Credential - Token/API key asociado a un skill (Fase 9)
 */
export interface SkillCredential {
  id: string;                    // UUID
  userId: string;
  skillName: string;             // Nombre del skill que lo requiere
  key: string;                   // Nombre de la variable (ej: "GITHUB_TOKEN")
  encryptedValue: string;        // Valor encriptado
  encryptionIv: string;          // IV usado en la encriptación
  encryptionTag: string;         // GCM auth tag
  createdAt: Date;
  updatedAt: Date;
  lastUsed?: Date;               // Cuándo se usó por última vez
}

/**
 * Background Process - Proceso ejecutándose en background (Fase 9)
 */
export type ProcessStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface BackgroundProcess {
  id: string;                    // UUID = processId
  userId: string;
  skillName: string;             // Skill que generó el proceso
  command: string;               // Comando ejecutado
  status: ProcessStatus;
  startedAt: Date;
  completedAt?: Date;
  durationsMs?: number;          // Duración en millisegundos
  output?: string;               // stdout + stderr
  error?: string;                // Mensaje de error si falló
  exitCode?: number;             // Código de salida del proceso
}
