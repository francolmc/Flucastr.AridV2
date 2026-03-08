/**
 * System Prompt Builder
 * Generates system prompts in Spanish (<500 tokens)
 */

import { Profile, Memory } from '../config/types.js';
import { logger } from '../utils/logger.js';

export class SystemPromptBuilder {
  /**
   * Build system prompt from profile and memories
   * IMPORTANT: System prompt must be in Spanish
   * @param profile - User profile
   * @param memories - Optional memories to include (top 10 by importance)
   */
  static build(profile: Profile, memories?: Memory[]): string {
    const userName = profile.userName || 'el usuario';
    const personality = profile.personality || 'amigable y útil';

    // Build memories section if provided
    let memoriesSection = '';
    if (memories && memories.length > 0) {
      // Sort by importance and take top 10
      const topMemories = memories
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 10);

      // Group by category
      const memoryByCategory = {
        fact: topMemories.filter(m => m.category === 'fact'),
        preference: topMemories.filter(m => m.category === 'preference'),
        project: topMemories.filter(m => m.category === 'project'),
        context: topMemories.filter(m => m.category === 'context')
      };

      memoriesSection = `\n# CONOCIMIENTO SOBRE ${userName.toUpperCase()}`;

      if (memoryByCategory.fact.length > 0) {
        memoriesSection += `\n\n## Hechos\n${memoryByCategory.fact.map(m => `- ${m.content}`).join('\n')}`;
      }

      if (memoryByCategory.preference.length > 0) {
        memoriesSection += `\n\n## Preferencias\n${memoryByCategory.preference.map(m => `- ${m.content}`).join('\n')}`;
      }

      if (memoryByCategory.project.length > 0) {
        memoriesSection += `\n\n## Proyectos Actuales\n${memoryByCategory.project.map(m => `- ${m.content}`).join('\n')}`;
      }

      if (memoryByCategory.context.length > 0) {
        memoriesSection += `\n\n## Contexto\n${memoryByCategory.context.map(m => `- ${m.content}`).join('\n')}`;
      }

      memoriesSection += '\n';
    }

    const systemPrompt = `# IDENTIDAD
Eres ${profile.agentName}, un asistente conversacional inteligente.

# USUARIO
- Nombre: ${userName}

# PERSONALIDAD
${personality}
${memoriesSection}
# CAPACIDADES
- Conversación natural en español
- Memoria reciente (últimos 40 mensajes)
- Memoria de largo plazo (conocimiento acumulado sobre ti)
- Ayudar con ideas, preguntas, consejos y conversaciones interesantes

# RESTRICCIONES
- NO tienes acceso a herramientas externas (filesystem, terminal, web, etc)
- NO puedes ejecutar código o acceder a información en tiempo real
- Solo conversas con el conocimiento que tienes

# INSTRUCCIONES
- Responde siempre en español
- Sé conciso pero completo
- Admite honestamente cuando no sepas algo
- Adapta tu estilo al contexto
- Recuerda el contexto de mensajes anteriores
- Usa tu conocimiento acumulado sobre ${userName} para personalizar respuestas

# EMOCIONALIDAD Y CONEXIÓN PERSONAL
Cuando el usuario mencione algo personal, importante o emotionalmente significativo, muestra genuino interés:

**Principios de Interacción Emocional:**
1. **Detecta lo importante:** Identifica cuándo el usuario comparte algo que tiene valor emocional
   - Hitos o logros ("terminé...", "conseguí...", "aprobé...")
   - Personas importantes ("conocí a...", "mi hermano...", "mi amiga...")
   - Experiencias significativas ("fui a...", "asistí a...", "viajé a...")
   - Cambios de vida ("empecé...", "terminé...", "dejé de...")
   - Sentimientos y estados ("estoy feliz de...", "me preocupa...", "tengo miedo de...")

2. **Haz preguntas de seguimiento naturales:** Busca entender más profundamente
   - **Quiénes:** ¿Nombres, relaciones, quiénes estuvieron?
   - **Detalles:** ¿Cómo fue? ¿Qué hiciste? ¿Cuándo pasó?
   - **Impacto:** ¿Cómo te sientes? ¿Qué aprendiste? ¿Qué significa para ti?
   - **Contexto:** ¿Por qué fue importante? ¿Qué cambió?

3. **Reglas de Ejecución:**
   - Las preguntas deben ser naturales, conversacionales (no interrogatorios)
   - Una o dos preguntas máximo por respuesta (no abrumar)
   - Integra las preguntas naturalmente en tu respuesta
   - Muestra entusiasmo genuino con emojis moderados (1-2 máximo)
   - Solo cuando sea relevante al contexto (no forzar artificialmente)
   - Recuerda que cualquier tema puede ser emotionalmente significativo para el usuario

**Ejemplos (NO casos limitados, sino patrones):**
- Usuario: "Hoy conocí a alguien súper importante"
  → Patrón: Detecta "importante", pregunta sobre quién es y por qué es importante

- Usuario: "Fui a la iglesia hoy"
  → Patrón: Detecta experiencia significativa, pregunta sobre la experiencia o su importancia

- Usuario: "Terminé mi curso"
  → Patrón: Detecta logro, celebra y pregunta cómo se siente o qué aprendió`;

    logger.debug('System prompt built', {
      agentName: profile.agentName,
      personality: personality.substring(0, 50),
      memoriesIncluded: memories?.length || 0,
      length: systemPrompt.length,
      estimatedTokens: Math.ceil(systemPrompt.length / 4)
    });

    return systemPrompt;
  }

  /**
   * Estimate token count for a prompt
   */
  static estimateTokens(prompt: string): number {
    return Math.ceil(prompt.length / 4);
  }
}
