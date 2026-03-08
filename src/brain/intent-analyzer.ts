/**
 * Intent Analyzer
 * Analyzes user message intent using LLM reasoning (NO keywords)
 */

import { LLMProvider } from '../llm/provider.interface.js';
import { IntentAnalysis } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { LLMError } from '../utils/errors.js';

export class IntentAnalyzer {
  private analyzerLLM: LLMProvider;

  constructor(analyzerLLM: LLMProvider) {
    this.analyzerLLM = analyzerLLM;
  }

  /**
   * Analyze message intent using LLM reasoning
   * Returns analysis indicating whether deep reasoning is needed
   */
  async analyze(
    messageText: string,
    conversationContext?: string[]
  ): Promise<IntentAnalysis> {
    try {
      const systemPrompt = `Eres un analizador de intenciones. Analiza el siguiente mensaje del usuario y determina:

1. ¿Requiere razonamiento profundo o análisis complejo?
   - Explicaciones técnicas detalladas
   - Comparaciones complejas entre conceptos
   - Análisis de múltiples pasos
   - Razonamiento lógico elaborado
   - Resolución de problemas complejos

2. ¿Es conversación casual simple?
   - Saludos y despedidas
   - Preguntas simples de una sola respuesta
   - Charla informal
   - Confirmaciones o agradecimientos
   - Comentarios breves

Responde SOLO con JSON válido (sin markdown ni formato adicional):
{
  "needsReasoning": boolean,
  "complexity": "simple" | "medium" | "complex",
  "reasoning": "breve explicación de tu decisión en una línea",
  "confidence": 0.0-1.0
}`;

      const contextHint = conversationContext && conversationContext.length > 0
        ? `\n\nContexto de conversación previa:\n${conversationContext.slice(-3).join('\n')}`
        : '';

      const response = await this.analyzerLLM.generateContent(
        [{ role: 'user', content: messageText + contextHint }],
        systemPrompt
      );

      // Parse JSON response
      const content = response.content.trim();

      // Remove markdown code blocks if present
      const jsonContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const intent = JSON.parse(jsonContent);

      logger.debug('Intent analyzed', {
        message: messageText.substring(0, 50),
        needsReasoning: intent.needsReasoning,
        complexity: intent.complexity,
        confidence: intent.confidence
      });

      return {
        needsReasoning: Boolean(intent.needsReasoning),
        complexity: intent.complexity || 'medium',
        reasoning: intent.reasoning || 'No reasoning provided',
        confidence: Number(intent.confidence) || 0.5
      };
    } catch (error) {
      logger.error('Intent analysis failed', error);

      // Fallback to safe default (use reasoning model)
      logger.warn('Using fallback intent analysis (reasoning=true)');
      return {
        needsReasoning: true,
        complexity: 'medium',
        reasoning: 'Fallback due to analysis error',
        confidence: 0.5
      };
    }
  }

  /**
   * Get a simple intent analysis without LLM (for testing or fallback)
   */
  getSimpleIntent(messageText: string): IntentAnalysis {
    const isShort = messageText.length < 50;
    const hasQuestionWords = /^(qué|cómo|cuándo|dónde|por qué|quién|cuál)/i.test(messageText);
    const isGreeting = /^(hola|hi|hey|buenos días|buenas tardes|buenas noches)/i.test(messageText);

    const needsReasoning = !isGreeting && (!isShort || hasQuestionWords);

    return {
      needsReasoning,
      complexity: isShort ? 'simple' : 'medium',
      reasoning: 'Simple heuristic analysis (fallback)',
      confidence: 0.6
    };
  }
}
