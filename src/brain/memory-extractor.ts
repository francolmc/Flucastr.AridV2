/**
 * MemoryExtractor - Analyzes conversations and extracts memorable information
 * Uses LLM reasoning to identify facts, preferences, projects, and context
 */

import { LLMProvider } from '../llm/provider.interface.js';
import { ConversationMessage, Memory, MemoryCategory } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { BrainError } from '../utils/errors.js';

interface ExtractedMemory {
  category: MemoryCategory;
  content: string;
  importance: number;
}

interface ExtractionResult {
  memories: ExtractedMemory[];
}

export class MemoryExtractor {
  private extractorLLM: LLMProvider;

  constructor(extractorLLM: LLMProvider) {
    this.extractorLLM = extractorLLM;
  }

  /**
   * Extract memories from recent conversation messages
   * @param userId - User ID
   * @param recentMessages - Last 4-6 messages from conversation
   * @param existingMemories - Current memories to avoid duplicates
   */
  async extractMemories(
    userId: string,
    recentMessages: ConversationMessage[],
    existingMemories?: Memory[]
  ): Promise<Omit<Memory, 'id' | 'createdAt'>[]> {
    try {
      // Build conversation text
      const conversationText = recentMessages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n\n');

      // Build existing memories text (to avoid duplicates)
      let existingMemoriesText = '';
      if (existingMemories && existingMemories.length > 0) {
        const memoryList = existingMemories
          .map(m => `- [${m.category}] ${m.content}`)
          .join('\n');
        existingMemoriesText = `\n\nMemorias existentes (NO duplicar):\n${memoryList}`;
      }

      // System prompt for extraction
      const systemPrompt = `Eres un extractor de memorias. Analiza la conversación y extrae información relevante sobre el usuario que debería recordarse para futuras conversaciones.

# REGLAS DE EXTRACCIÓN

Extrae SOLO información nueva, significativa y útil. NO extraigas:
- Saludos o charla casual sin contenido
- Información temporal (ej: "hoy hace calor", "es lunes")
- Cosas obvias o genéricas
- Información que ya existe en las memorias actuales

SÍ extrae información como:
- **Hechos (fact)**: Información factual sobre el usuario
  Ejemplos: "Es desarrollador fullstack", "Vive en Argentina", "Usa VSCode"

- **Preferencias (preference)**: Gustos, estilos, preferencias del usuario
  Ejemplos: "Prefiere código con ejemplos", "Le gusta el café", "Prefiere TypeScript sobre JavaScript"

- **Proyectos (project)**: Proyectos actuales o trabajos en progreso
  Ejemplos: "Está trabajando en AridV2, un asistente conversacional", "Está aprendiendo Rust"

- **Contexto (context)**: Contexto personal relevante
  Ejemplos: "Trabaja desde casa", "Le interesa la IA", "Tiene experiencia con Docker"

Para cada memoria extraída, determina:
- **category**: 'fact' | 'preference' | 'project' | 'context'
- **content**: Descripción clara y concisa (1-2 oraciones máximo)
- **importance**: 0.0-1.0 donde:
  - 0.9-1.0 = Información crítica (proyectos actuales, preferencias fuertes)
  - 0.7-0.8 = Información importante (hechos relevantes, contexto útil)
  - 0.5-0.6 = Información útil (detalles menores, preferencias secundarias)
  - <0.5 = No extraer (probablemente no es relevante)

# FORMATO DE RESPUESTA

Responde SOLO con JSON válido, sin texto adicional:

{
  "memories": [
    {
      "category": "preference",
      "content": "Prefiere explicaciones técnicas con ejemplos de código",
      "importance": 0.85
    },
    {
      "category": "project",
      "content": "Está desarrollando AridV2, un asistente conversacional con arquitectura modular",
      "importance": 0.95
    }
  ]
}

Si NO hay nada relevante que extraer, retorna:

{
  "memories": []
}`;

      const prompt = `${conversationText}${existingMemoriesText}`;

      // Call LLM
      const response = await this.extractorLLM.generateContent(
        [{ role: 'user', content: prompt }],
        systemPrompt
      );

      // Parse JSON response
      let result: ExtractionResult;
      try {
        // Clean response (remove markdown code blocks if present)
        let cleanedContent = response.content.trim();
        if (cleanedContent.startsWith('```')) {
          cleanedContent = cleanedContent
            .replace(/^```json?\n?/, '')
            .replace(/\n?```$/, '');
        }

        result = JSON.parse(cleanedContent);
      } catch (parseError) {
        logger.warn('Failed to parse extraction JSON', {
          error: parseError,
          content: response.content.substring(0, 200)
        });
        return [];
      }

      // Validate result
      if (!result.memories || !Array.isArray(result.memories)) {
        logger.warn('Invalid extraction result format', { result });
        return [];
      }

      // Convert to Memory objects
      const timestamp = new Date().toISOString();
      const memories: Omit<Memory, 'id' | 'createdAt'>[] = result.memories
        .filter(m => m.importance >= 0.5) // Only keep important memories
        .map(m => ({
          userId,
          category: m.category,
          content: m.content,
          source: `conversation-${timestamp}`,
          importance: m.importance,
          accessCount: 0
        }));

      logger.info('Memories extracted', {
        userId,
        count: memories.length,
        categories: memories.map(m => m.category)
      });

      return memories;
    } catch (error) {
      logger.error('Failed to extract memories', error);
      throw new BrainError(`Failed to extract memories: ${error}`);
    }
  }
}
