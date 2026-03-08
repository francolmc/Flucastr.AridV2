/**
 * ProspectiveCommandAnalyzer - Detecta comandos sobre intenciones en conversación
 * Permite: "marca como completada el ir a buscar...", "elimina la reunión de mañana", etc.
 */

import { ProspectiveMemory } from '../config/types.js';
import { logger } from '../utils/logger.js';

export interface ProspectiveCommand {
  action: 'complete' | 'delete' | 'cancel' | null;
  targetContent: string | null;
  confidence: number;
}

export class ProspectiveCommandAnalyzer {
  /**
   * Analiza si el mensaje contiene un comando sobre intenciones
   */
  analyzeCommand(text: string): ProspectiveCommand {
    const lowerText = text.toLowerCase();

    // Patrones para COMPLETE
    const completePatterns = [
      /marcar\s+como\s+completa(?:da)?(?:\s+(?:el|la|los|las))?\s+(.+?)(?:\.|$|,)/i,
      /marca(?:r)?\s+(?:completad[ao])?\s+(?:el|la|los|las)?\s+(.+?)(?:\.|$|,)/i,
      /ya\s+(?:hice|hizo|hicimos|hicieron|terminé|termino|terminamos|completé|completo|completamos)\s+(?:el|la|los|las)?\s+(.+?)(?:\.|$|,)/i,
      /(?:el|la|los|las)?\s+(.+?)\s+(?:ya\s+)?(?:completad[ao]|hecho|listo|terminado|done)(?:\.|$|,)/i,
      /completar\s+(?:el|la|los|las)?\s+(.+?)(?:\.|$|,)/i,
      /terminar\s+(?:el|la|los|las)?\s+(.+?)(?:\.|$|,)/i,
    ];

    // Patrones para DELETE
    const deletePatterns = [
      /(?:elimina|borra|quita)\s+(?:la|el|los|las)?\s+(.+?)(?:\.|$|,)/i,
      /(?:no\s+)?necesito\s+(?:ya\s+)?(?:el|la|los|las)?\s+(.+?)(?:\.|$|,)/i,
      /cancela\s+(?:la\s+)?intención\s+(?:de|del?)?\s+(.+?)(?:\.|$|,)/i,
      /quiero\s+eliminar\s+(?:el|la|los|las)?\s+(.+?)(?:\.|$|,)/i,
    ];

    // Patrones para CANCEL
    const cancelPatterns = [
      /cancela(?:r)?\s+(?:el|la|los|las)?\s+(.+?)(?:\.|$|,)/i,
      /(?:no\s+)?voy\s+a\s+(?:poder\s+)?(.+?)(?:\.|$|,)/i,
      /(?:se\s+canceló|cancelé|cancele)\s+(?:el|la|los|las)?\s+(.+?)(?:\.|$|,)/i,
      /no\s+puedo\s+(?:ir\s+a\s+)?(.+?)(?:\.|$|,)/i,
    ];

    // Verificar COMPLETE
    for (const pattern of completePatterns) {
      const match = lowerText.match(pattern);
      if (match && match[1]) {
        return {
          action: 'complete',
          targetContent: match[1].trim(),
          confidence: 0.85
        };
      }
    }

    // Verificar DELETE
    for (const pattern of deletePatterns) {
      const match = lowerText.match(pattern);
      if (match && match[1]) {
        return {
          action: 'delete',
          targetContent: match[1].trim(),
          confidence: 0.8
        };
      }
    }

    // Verificar CANCEL
    for (const pattern of cancelPatterns) {
      const match = lowerText.match(pattern);
      if (match && match[1]) {
        return {
          action: 'cancel',
          targetContent: match[1].trim(),
          confidence: 0.8
        };
      }
    }

    return {
      action: null,
      targetContent: null,
      confidence: 0
    };
  }

  /**
   * Encuentra la intención que coincida con el contenido descrito
   */
  findProspective(
    prospectives: ProspectiveMemory[],
    targetContent: string
  ): ProspectiveMemory | null {
    const lowerTarget = targetContent.toLowerCase();

    // Buscar por similitud de contenido
    for (const p of prospectives) {
      const pContentLower = p.content.toLowerCase();

      // Match exacto
      if (pContentLower.includes(lowerTarget) || lowerTarget.includes(pContentLower)) {
        return p;
      }

      // Match de palabras clave (al menos 2 palabras coinciden)
      const targetWords = lowerTarget.split(/\s+/).filter(w => w.length > 3);
      const contentWords = pContentLower.split(/\s+/).filter(w => w.length > 3);

      const matches = targetWords.filter(tw =>
        contentWords.some(cw =>
          cw.includes(tw) || tw.includes(cw)
        )
      );

      if (matches.length >= 2 && targetWords.length > 0) {
        return p;
      }

      // Match de palabras individuales al menos 50%
      if (targetWords.length > 0) {
        const matchPercentage = matches.length / targetWords.length;
        if (matchPercentage >= 0.5) {
          return p;
        }
      }
    }

    return null;
  }
}
