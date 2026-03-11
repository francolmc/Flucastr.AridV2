/**
 * SkillMatcher - Pre-filtrado inteligente de skills relevantes
 * Usa LLM ligero para analizar el mensaje y seleccionar top 3-5 skills
 * Escalable a 100+ skills sin impacto de performance
 * Fase 9: Skills System / Fase 2
 */

import { SkillStore } from '../storage/skill.store.js';
import { LLMProvider } from '../llm/provider.interface.js';
import { logger } from '../utils/logger.js';

export interface SkillMatch {
  name: string;
  description: string;
  confidence: number;  // 0.0-1.0
  keywords: string[];
  reasoning: string;   // Por qué es relevante
}

export class SkillMatcher {
  private skillStore: SkillStore;
  private analyzerProvider: LLMProvider;

  constructor(skillStore: SkillStore, analyzerProvider: LLMProvider) {
    this.skillStore = skillStore;
    this.analyzerProvider = analyzerProvider;
  }

  /**
   * Analizar mensaje y retornar top 3-5 skills relevantes
   * Escalable: pre-filtra por keywords antes de usar LLM para reducir tokens
   */
  async matchSkills(userId: string, userMessage: string): Promise<SkillMatch[]> {
    try {
      // Obtener todos los skills disponibles del filesystem
      const allSkills = await this.skillStore.listAvailableSkills();

      logger.debug('Skill matching started', {
        userId,
        messageLength: userMessage.length,
        availableSkillsCount: allSkills.length,
        availableSkillsNames: allSkills.map(s => s.name)
      });

      // Si no hay skills, retornar vacío
      if (allSkills.length === 0) {
        logger.warn('No skills available in filesystem', { userId });
        return [];
      }

      // OPTIMIZACIÓN: Pre-filtrado rápido por keywords
      // Si hay muchos skills (>50), hacer un pre-filtrado local primero
      let candidateSkills = allSkills;
      if (allSkills.length > 50) {
        candidateSkills = this.preFilterByKeywords(allSkills, userMessage);

        // Si el pre-filtrado retorna menos de 10, tomar todos
        // (el LLM es lo suficientemente rápido)
        if (candidateSkills.length === 0) {
          candidateSkills = allSkills.slice(0, 20);  // Tomar primeros 20 como fallback
        }
      }

      logger.debug('Pre-filtered candidates', {
        userId,
        candidateCount: candidateSkills.length,
        candidates: candidateSkills.map(s => s.name)
      });

      // Preparar lista de skills para el LLM (solo metadatos básicos)
      const skillsForLLM = candidateSkills.map(skill => ({
        name: skill.name,
        description: skill.description,
      }));

      // Consultar LLM para análisis semántico
      const matchResults = await this.analyzeWithLLM(userMessage, skillsForLLM);

      logger.debug('LLM analysis results', {
        userId,
        resultCount: matchResults.length,
        results: matchResults.map(r => ({ name: r.name, confidence: r.confidence }))
      });

      // Filtrar por confidence >= 0.6 y ordenar por score
      const matches = matchResults
        .filter(m => m.confidence >= 0.6)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5);  // Top 5 máximo

      logger.info('Skills matched', {
        userId,
        messageLength: userMessage.length,
        availableCount: allSkills.length,
        candidateCount: candidateSkills.length,
        matchCount: matches.length,
        matchedSkills: matches.map(m => ({ name: m.name, confidence: m.confidence })),
      });

      return matches;
    } catch (error) {
      logger.error('Failed to match skills', { error: String(error), stack: error instanceof Error ? error.stack : '' });
      return [];
    }
  }

  /**
   * Pre-filtrado local rápido por nombre y descripción (sin usar LLM)
   * Reduce la cantidad de skills a pasar al LLM para análisis semántica
   */
  private preFilterByKeywords(allSkills: any[], userMessage: string): any[] {
    const messageLower = userMessage.toLowerCase();
    const messageWords = messageLower.split(/\s+/);

    // Puntaje local para cada skill basado en nombre y descripción
    const scores = allSkills.map(skill => {
      let score = 0;

      // Buscar nombre del skill en el mensaje
      if (messageWords.includes(skill.name.toLowerCase())) {
        score += 3;
      } else if (messageLower.includes(skill.name.toLowerCase())) {
        score += 1.5;
      }

      // Buscar palabras de descripción
      const descWords = skill.description.toLowerCase().split(/\s+/);
      for (const word of messageWords) {
        if (descWords.includes(word) && word.length > 3) {
          score += 0.5;
        }
      }

      return { skill, score };
    });

    // Retornar top 20-30 skills (o todos si hay menos de 30)
    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map(item => item.skill);
  }

  /**
   * Usar LLM ligero para análisis semántico de skills relevantes
   */
  private async analyzeWithLLM(
    userMessage: string,
    skillsForLLM: Array<{ name: string; description: string }>
  ): Promise<SkillMatch[]> {
    try {
      // Construir prompt para análisis de relevancia
      const skillsList = skillsForLLM
        .map((s, i) => `${i + 1}. **${s.name}** - ${s.description}`)
        .join('\n\n');

      const analysisPrompt = `Analiza el siguiente mensaje del usuario e identifica cuáles de los skills disponibles son relevantes para responderlo.

## Mensaje del usuario:
"${userMessage}"

## Skills disponibles:
${skillsList}

## Instrucciones:
1. Analiza semánticamente si cada skill es relevante para el mensaje
2. Para cada skill relevante, asigna un score de confianza (0.0-1.0)
3. Solo incluye skills con confidence >= 0.6
4. Ordena por confidence descendente
5. Maximum 5 skills

## Responde con JSON (sin código markdown):
[
  {
    "name": "skill-name",
    "confidence": 0.95,
    "reasoning": "Por qué es relevante"
  }
]`;

      const response = await this.analyzerProvider.generateContent([
        {
          role: 'user',
          content: analysisPrompt,
        },
      ]);

      // Parsear respuesta JSON
      let jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.warn('Failed to extract JSON from skill matcher response');
        return [];
      }

      const results = JSON.parse(jsonMatch[0]);

      // Enriquecer con descripción
      return results.map((r: any) => {
        const skill = skillsForLLM.find(s => s.name === r.name);
        return {
          ...r,
          description: skill?.description || '',
        };
      });
    } catch (error) {
      logger.error('Failed to analyze skills with LLM', error);
      return [];
    }
  }

  /**
   * Obtener skill por nombre (para después de matching)
   */
  getSkillByName(userId: string, skillName: string): any {
    const allSkills = this.skillStore.listSkills(userId);
    return allSkills.find(s => s.name === skillName) || null;
  }

  /**
   * Búsqueda manual (alternativa a matching inteligente)
   * Útil para cuando el usuario dice explícitamente "usa el skill X"
   */
  searchSkill(userId: string, query: string): any[] {
    return this.skillStore.searchSkills(userId, query);
  }
}
