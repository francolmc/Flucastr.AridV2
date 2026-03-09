import { LLMProvider } from '../llm/provider.interface.js';
import { ToolAction } from './tool-actions.store.js';
import { logger } from '../utils/logger.js';

export interface ToolRequest {
  action: ToolAction | null;
  targetResource: string;
  description: string;
  parameters?: Record<string, any>;
  confidence: number; // 0.0-1.0
  requiresConfirmation: boolean;
  reasoning: string;
}

/**
 * ToolsAnalyzer - Detecta solicitudes de herramientas con LLM
 *
 * Similar a IntentAnalyzer, usa LLM (Gemini cheap) para análisis inteligente
 * sin depender de keywords hardcodeados.
 *
 * Responsabilidades:
 * - Detectar si usuario solicita EXPLÍCITAMENTE una herramienta
 * - Determinar qué herramienta usar
 * - Extraer parámetros (path, comando, query)
 * - Decidir si requiere confirmación
 */
export class ToolsAnalyzer {
  private readonly llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
    logger.info('ToolsAnalyzer initialized');
  }

  /**
   * Analiza si el mensaje solicita una herramienta
   */
  async analyzeToolRequest(
    messageText: string,
    conversationContext?: string[]
  ): Promise<ToolRequest> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(messageText, conversationContext);

    try {
      const response = await this.llm.generateContent(
        [
          { role: 'user', content: userPrompt },
        ],
        systemPrompt
      );

      // Parsear JSON response
      const result = this.parseResponse(response.content);

      logger.info('Tool request analyzed', {
        action: result.action,
        confidence: result.confidence,
        requiresConfirmation: result.requiresConfirmation,
      });

      return result;
    } catch (error) {
      logger.error('Error analyzing tool request', { error });

      // Fallback: no detectar herramienta
      return {
        action: null,
        targetResource: '',
        description: '',
        confidence: 0,
        requiresConfirmation: false,
        reasoning: 'Error en análisis',
      };
    }
  }

  private buildSystemPrompt(): string {
    return `Eres un analizador de solicitudes de herramientas. Tu trabajo es determinar si el usuario está solicitando EXPLÍCITAMENTE usar una herramienta.

HERRAMIENTAS DISPONIBLES:

1. **read_file** - Leer el contenido de un archivo
   Ejemplos: "lee el archivo X", "muéstrame el contenido de X", "qué dice el archivo X"

2. **write_file** - Escribir o crear un archivo
   Ejemplos: "crea un archivo X con contenido Y", "escribe X en el archivo Y"

3. **list_directory** - Listar contenido de un directorio
   Ejemplos: "qué hay en la carpeta X", "lista los archivos en X", "muéstrame el directorio X"

4. **execute_command** - Ejecutar un comando shell
   Ejemplos: "ejecuta X", "corre el comando X", "haz npm install"

5. **web_search** - Buscar información en internet
   Ejemplos: "busca información sobre X", "qué es X" (si no es conocimiento común), "investiga X"

REGLAS IMPORTANTES:

- Solo detecta solicitudes EXPLÍCITAS. Si el usuario pregunta algo que podrías responder con tu conocimiento, NO uses herramientas.
- Si el usuario menciona un archivo/comando pero no pide explícitamente leerlo/ejecutarlo, NO detectes herramienta.
- Conversación normal NO requiere herramientas ("hola", "gracias", "explícame X que ya conoces").

CONFIRMACIÓN REQUERIDA:

- **write_file**: SIEMPRE requiere confirmación (escritura)
- **execute_command**: SIEMPRE requiere confirmación (ejecución)
- **read_file**: NO requiere confirmación (solo lectura)
- **list_directory**: NO requiere confirmación (solo lectura)
- **web_search**: NO requiere confirmación (solo lectura)

Responde SOLO con JSON en este formato:

{
  "action": "read_file" | "write_file" | "list_directory" | "execute_command" | "web_search" | null,
  "targetResource": "path/comando/query",
  "description": "Descripción natural de la acción",
  "parameters": { "key": "value" } (opcional),
  "confidence": 0.95,
  "requiresConfirmation": true/false,
  "reasoning": "Por qué detectaste esta herramienta (o por qué no)"
}`;
  }

  private buildUserPrompt(
    messageText: string,
    conversationContext?: string[]
  ): string {
    let prompt = `Mensaje del usuario: "${messageText}"\n\n`;

    if (conversationContext && conversationContext.length > 0) {
      prompt += `Contexto de conversación reciente:\n`;
      prompt += conversationContext.slice(-3).join('\n');
      prompt += '\n\n';
    }

    prompt += `¿Está solicitando usar una herramienta? Analiza y responde en JSON.`;

    return prompt;
  }

  private parseResponse(content: string): ToolRequest {
    try {
      // Extraer JSON del response (puede tener texto antes/después)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validar estructura
      return {
        action: parsed.action || null,
        targetResource: parsed.targetResource || '',
        description: parsed.description || '',
        parameters: parsed.parameters,
        confidence: parsed.confidence || 0,
        requiresConfirmation: parsed.requiresConfirmation || false,
        reasoning: parsed.reasoning || '',
      };
    } catch (error) {
      logger.error('Error parsing tool analysis response', {
        content,
        error,
      });

      // Fallback
      return {
        action: null,
        targetResource: '',
        description: '',
        confidence: 0,
        requiresConfirmation: false,
        reasoning: 'Error parseando respuesta',
      };
    }
  }
}
