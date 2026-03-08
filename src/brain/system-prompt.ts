/**
 * System Prompt Builder
 * Generates system prompts in Spanish (<500 tokens)
 */

import { Profile } from '../config/types.js';
import { logger } from '../utils/logger.js';

export class SystemPromptBuilder {
  /**
   * Build system prompt from profile
   * IMPORTANT: System prompt must be in Spanish
   */
  static build(profile: Profile): string {
    const userName = profile.userName || 'el usuario';
    const personality = profile.personality || 'amigable y útil';

    const systemPrompt = `# IDENTIDAD
Eres ${profile.agentName}, un asistente conversacional inteligente.

# USUARIO
- Nombre: ${userName}

# PERSONALIDAD
${personality}

# CAPACIDADES
- Conversación natural en español
- Memoria reciente (últimos 40 mensajes)
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
- Recuerda el contexto de mensajes anteriores`;

    logger.debug('System prompt built', {
      agentName: profile.agentName,
      personality: personality.substring(0, 50),
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
