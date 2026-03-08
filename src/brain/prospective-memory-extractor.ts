/**
 * ProspectiveMemoryExtractor - Extrae intenciones futuras de conversaciones
 * Usa LLM para detectar tareas, eventos y recordatorios en lenguaje natural
 */

import { LLMProvider } from '../llm/provider.interface.js';
import { ConversationMessage, ProspectiveMemory } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { BrainError } from '../utils/errors.js';

interface UserContext {
  temporal: {
    dateFormatted: string;
    timeFormatted: string;
    timezone: string;
    dayOfWeek: string;
    currentDate?: Date;  // Fecha actual en timezone del usuario
  };
}

interface ExtractedProspective {
  type: 'task' | 'event' | 'reminder';
  category: 'personal' | 'work' | 'health' | 'social';
  content: string;
  context?: string;
  dueDate?: string;      // ISO 8601 string
  dueTime?: string;      // HH:MM
  isAllDay: boolean;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    daysOfWeek?: number[];
    dayOfMonth?: number;
    endDate?: string;
    occurrences?: number;
  };
  priority: number;
}

interface ExtractionResult {
  prospectives: ExtractedProspective[];
}

export class ProspectiveMemoryExtractor {
  private analyzerProvider: LLMProvider;

  constructor(analyzerProvider: LLMProvider) {
    this.analyzerProvider = analyzerProvider;
  }

  /**
   * Extrae intenciones futuras de la conversación
   */
  async extractProspectives(
    userId: string,
    recentMessages: ConversationMessage[],
    existingProspectives: ProspectiveMemory[],
    userContext: UserContext
  ): Promise<Partial<ProspectiveMemory>[]> {
    try {
      // Build conversation text
      const conversationText = recentMessages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n\n');

      // Build existing prospectives text
      let existingText = '';
      if (existingProspectives && existingProspectives.length > 0) {
        const prospectiveList = existingProspectives
          .filter(p => p.status === 'pending')
          .slice(0, 10) // Limitar a 10 para no saturar el prompt
          .map(p => {
            let str = `- ${p.content}`;
            if (p.dueDate) {
              str += ` (${new Date(p.dueDate).toLocaleDateString()})`;
            }
            return str;
          })
          .join('\n');
        existingText = `\n\nIntenciones existentes (NO duplicar):\n${prospectiveList}`;
      }

      // System prompt
      const systemPrompt = this.buildExtractionPrompt(userContext, existingText);

      // Call LLM
      const userMessage = `${systemPrompt}\n\n# CONVERSACIÓN\n\n${conversationText}`;
      const response = await this.analyzerProvider.generateContent(
        [{ role: 'user', content: userMessage }],
        '' // No system prompt needed, already in user message
      );

      // Parse JSON response
      const result = this.parseExtractionResult(response.content);

      // Convert to partial ProspectiveMemory objects
      const prospectives: Partial<ProspectiveMemory>[] = result.prospectives.map(p => {
        let dueDate: Date | undefined;

        if (p.dueDate) {
          // Parse the date string (YYYY-MM-DD or ISO format)
          // We need to create this date in the USER'S timezone, not UTC
          const dateStr = p.dueDate.split('T')[0]; // Get just YYYY-MM-DD part
          const [year, month, day] = dateStr.split('-').map(Number);

          // Create a date object representing midnight in the user's local timezone
          // NOT in UTC (which new Date(isoString) would do)
          dueDate = new Date(year, month - 1, day, 0, 0, 0, 0);
        }

        return {
          userId,
          type: p.type,
          category: p.category,
          content: p.content,
          context: p.context,
          dueDate,
          dueTime: p.dueTime,
          isAllDay: p.isAllDay,
          recurrence: p.recurrence ? {
            ...p.recurrence,
            endDate: p.recurrence.endDate ? (() => {
              const endDateStr = p.recurrence.endDate!.split('T')[0];
              const [y, m, d] = endDateStr.split('-').map(Number);
              return new Date(y, m - 1, d, 0, 0, 0, 0);
            })() : undefined
          } : undefined,
          nextOccurrence: dueDate ? new Date(dueDate) : undefined,
          status: 'pending',
          priority: p.priority,
          source: `conversation-${Date.now()}`,
          mentionCount: 0
        };
      });

      logger.info('Prospectives extracted', {
        userId,
        count: prospectives.length,
        types: prospectives.map(p => p.type)
      });

      return prospectives;

    } catch (error) {
      logger.error('Failed to extract prospective memories', error);
      // No throw - just return empty array
      return [];
    }
  }

  /**
   * Construye el system prompt para extracción
   */
  private buildExtractionPrompt(userContext: UserContext, existingText: string): string {
    return `Eres un asistente que identifica INTENCIONES FUTURAS en conversaciones naturales.

# CONTEXTO DEL USUARIO
- Fecha y hora actual: ${userContext.temporal.dateFormatted}, ${userContext.temporal.timeFormatted}
- Zona horaria: ${userContext.temporal.timezone}
- Día de la semana: ${userContext.temporal.dayOfWeek}

# TU TAREA
Analiza la conversación y detecta cuando el usuario expresa una INTENCIÓN FUTURA:
- Algo que quiere/debe hacer
- Un evento al que asistirá
- Algo que quiere recordar

# TIPOS DE INTENCIONES

## 1. TASK (Tarea)
- Acción que el usuario debe realizar
- Ejemplos:
  - "Tengo que llamar a mi mamá mañana"
  - "Debo terminar el informe antes del viernes"
  - "Quiero estudiar React"
  - "Necesito comprar leche"

## 2. EVENT (Evento)
- Evento programado al que el usuario asiste
- Ejemplos:
  - "El viernes tengo reunión con el equipo a las 3pm"
  - "El lunes voy al médico"
  - "Mañana es el cumpleaños de mi hermana"

## 3. REMINDER (Recordatorio)
- Algo que el usuario quiere que le recuerden
- Ejemplos:
  - "Recuérdame revisar los correos esta tarde"
  - "No olvides que tengo que llamar al banco"
  - "Cuando vaya al super, comprar pan"

# DETECCIÓN TEMPORAL

Interpreta referencias temporales naturales:
- "mañana" → tomorrow from current date
- "pasado mañana" → day after tomorrow
- "el viernes" → next Friday
- "en 3 días" → 3 days from now
- "esta tarde" → today at 15:00-18:00
- "la próxima semana" → next week (estimate Monday)

Si NO se especifica hora exacta:
- Tasks sin hora → dueTime: null, isAllDay: true
- Events → inferir hora razonable (ej: "reunión" → 10:00)
- Reminders → según contexto temporal mencionado

# RECURRENCIA

Detecta patrones recurrentes:
- "todos los días" → {frequency: 'daily', interval: 1}
- "cada lunes" → {frequency: 'weekly', interval: 1, daysOfWeek: [1]}
- "cada 2 semanas" → {frequency: 'weekly', interval: 2}
- "mensual" → {frequency: 'monthly', interval: 1}

# PRIORIDAD (0.0-1.0)

Asigna prioridad basada en:
- 0.9-1.0: URGENTE (deadline cercano, consecuencias importantes)
- 0.7-0.8: IMPORTANTE (debe hacerse pronto, significativo)
- 0.5-0.6: NORMAL (rutinario, flexible)
- 0.3-0.4: OPCIONAL (deseable pero no crítico)

Pistas lingüísticas:
- "urgente", "importante", "crucial" → alta prioridad
- "cuando pueda", "si tengo tiempo" → baja prioridad
- Deadlines cercanos → alta prioridad
- Tareas recurrentes rutinarias → prioridad media

# CATEGORÍAS

Clasifica en:
- personal: Vida personal (familia, hobbies, personal care)
- work: Trabajo (reuniones, proyectos, deadlines)
- health: Salud (ejercicio, médico, medicación)
- social: Social (eventos, amigos, cumpleaños)

# CONTEXTO ADICIONAL

Extrae información adicional relevante:
- Ubicación (si se menciona dónde)
- Personas involucradas (con quién)
- Razón o propósito (por qué es importante)

# EVITAR EXTRAER

NO extraes intenciones si:
- Es charla casual sobre el pasado ("ayer fui al cine")
- Es una pregunta hipotética ("¿debería hacer X?")
- Ya está en intenciones existentes (evita duplicados)
- Es muy vaga sin contexto temporal ("algún día quiero aprender piano")
${existingText}

# FORMATO DE SALIDA

Retorna JSON con array "prospectives":

{
  "prospectives": [
    {
      "type": "task" | "event" | "reminder",
      "category": "personal" | "work" | "health" | "social",
      "content": "Descripción clara en 1-2 líneas",
      "context": "Contexto adicional (opcional)",
      "dueDate": "ISO 8601 date string o null",
      "dueTime": "HH:MM o null",
      "isAllDay": boolean,
      "recurrence": null o {frequency, interval, ...},
      "priority": number (0.0-1.0)
    }
  ]
}

Si NO hay intenciones futuras en la conversación, retorna:
{
  "prospectives": []
}

IMPORTANTE: Responde SOLO con JSON válido, sin texto adicional antes o después.`;
  }

  /**
   * Parse JSON response from LLM
   */
  private parseExtractionResult(content: string): ExtractionResult {
    try {
      // Remove markdown code blocks if present
      let jsonText = content.trim();

      if (jsonText.startsWith('```')) {
        const lines = jsonText.split('\n');
        jsonText = lines.slice(1, -1).join('\n');
      }

      if (jsonText.startsWith('json')) {
        jsonText = jsonText.substring(4).trim();
      }

      const result = JSON.parse(jsonText);

      // Validate structure
      if (!result.prospectives || !Array.isArray(result.prospectives)) {
        logger.warn('Invalid extraction result structure', { result });
        return { prospectives: [] };
      }

      return result;

    } catch (error) {
      logger.error('Failed to parse extraction result', { content, error });
      return { prospectives: [] };
    }
  }
}
