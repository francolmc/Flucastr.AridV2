/**
 * ProspectiveMemoryStore - Gestiona memoria prospectiva (intenciones futuras)
 *
 * Implementa almacenamiento y queries para tareas, eventos y recordatorios
 * con soporte para recurrencia y clasificación temporal.
 */

import { v4 as uuidv4 } from 'uuid';
import { JSONStore } from './json-store.js';
import { ProspectiveMemory, ProspectiveStatus, ProspectiveType, ProspectiveCategory } from '../config/types.js';
import { logger } from '../utils/logger.js';

export class ProspectiveMemoryStore {
  private store: JSONStore;

  constructor(store: JSONStore) {
    this.store = store;
  }

  /**
   * Guarda una nueva memoria prospectiva con deduplicación
   */
  saveProspective(prospective: Partial<ProspectiveMemory>): ProspectiveMemory | null {
    const now = new Date();
    const userId = prospective.userId!;

    // Check for duplicates using similarity matching
    const existing = this.findSimilar(userId, prospective.content!);
    if (existing) {
      logger.info('Prospective duplicate detected, skipping', {
        userId,
        newContent: prospective.content,
        existingId: existing.id,
        existingContent: existing.content
      });
      return null; // Duplicate, don't save
    }

    const fullProspective: ProspectiveMemory = {
      id: uuidv4(),
      userId,
      type: prospective.type!,
      category: prospective.category!,
      content: prospective.content!,
      context: prospective.context,
      dueDate: prospective.dueDate,
      dueTime: prospective.dueTime,
      isAllDay: prospective.isAllDay ?? true,
      recurrence: prospective.recurrence,
      nextOccurrence: prospective.nextOccurrence,
      status: prospective.status ?? 'pending',
      priority: prospective.priority ?? 0.5,
      source: prospective.source ?? `conversation-${now.toISOString()}`,
      createdAt: now,
      updatedAt: now,
      completedAt: prospective.completedAt,
      lastMentioned: prospective.lastMentioned,
      mentionCount: prospective.mentionCount ?? 0
    };

    this.store.addProspective(userId, fullProspective);

    logger.info('Prospective memory saved', {
      userId: fullProspective.userId,
      id: fullProspective.id,
      type: fullProspective.type,
      content: fullProspective.content.substring(0, 50)
    });

    return fullProspective;
  }

  /**
   * Encuentra intenciones similares usando similarity matching
   */
  private findSimilar(userId: string, content: string): ProspectiveMemory | null {
    const prospectives = this.store.getProspectives(userId);
    const contentWords = content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);

    for (const p of prospectives) {
      // Skip completed/cancelled
      if (p.status !== 'pending') continue;

      const prospectiveWords = p.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);

      // Calculate word overlap
      const matches = contentWords.filter((word: string) =>
        prospectiveWords.some((pword: string) => this.levenshteinDistance(word, pword) <= 1)
      );

      // If 60%+ of words match, consider it a duplicate
      const similarity = matches.length / Math.max(contentWords.length, prospectiveWords.length);
      if (similarity >= 0.6) {
        return p;
      }
    }

    return null;
  }

  /**
   * Calculate Levenshtein distance for fuzzy matching
   */
  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Obtiene una memoria prospectiva específica
   */
  getProspective(userId: string, id: string): ProspectiveMemory | null {
    const prospectives = this.store.getProspectives(userId);
    return prospectives.find(p => p.id === id) || null;
  }

  /**
   * Actualiza una memoria prospectiva
   */
  updateProspective(userId: string, id: string, updates: Partial<ProspectiveMemory>): void {
    this.store.updateProspective(userId, id, {
      ...updates,
      updatedAt: new Date()
    });

    logger.debug('Prospective memory updated', { userId, id, updates });
  }

  /**
   * Elimina una memoria prospectiva
   */
  deleteProspective(userId: string, id: string): void {
    this.store.deleteProspective(userId, id);
    logger.debug('Prospective memory deleted', { userId, id });
  }

  /**
   * Obtiene memorias vencidas (overdue)
   */
  getOverdue(userId: string): ProspectiveMemory[] {
    const prospectives = this.store.getProspectives(userId);
    const now = new Date();

    return prospectives.filter(p =>
      p.status === 'pending' &&
      p.dueDate &&
      new Date(p.dueDate) < now
    );
  }

  /**
   * Obtiene memorias para hoy
   */
  getDueToday(userId: string): ProspectiveMemory[] {
    const prospectives = this.store.getProspectives(userId);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    return prospectives.filter(p =>
      p.status === 'pending' &&
      p.dueDate &&
      new Date(p.dueDate) >= todayStart &&
      new Date(p.dueDate) < todayEnd
    );
  }

  /**
   * Obtiene memorias próximas (siguientes N días)
   */
  getUpcoming(userId: string, days: number): ProspectiveMemory[] {
    const prospectives = this.store.getProspectives(userId);
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + days);

    return prospectives.filter(p =>
      p.status === 'pending' &&
      p.dueDate &&
      new Date(p.dueDate) > now &&
      new Date(p.dueDate) <= futureDate
    ).sort((a, b) => {
      // Ordenar por fecha y luego por prioridad
      const dateA = new Date(a.dueDate!);
      const dateB = new Date(b.dueDate!);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      return b.priority - a.priority;
    });
  }

  /**
   * Obtiene todas las memorias pendientes
   */
  getPending(userId: string): ProspectiveMemory[] {
    const prospectives = this.store.getProspectives(userId);
    return prospectives.filter(p => p.status === 'pending');
  }

  /**
   * Obtiene memorias completadas (últimas N)
   */
  getCompleted(userId: string, limit: number = 10): ProspectiveMemory[] {
    const prospectives = this.store.getProspectives(userId);
    return prospectives
      .filter(p => p.status === 'completed')
      .sort((a, b) => {
        const dateA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const dateB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, limit);
  }

  /**
   * Obtiene memorias recurrentes
   */
  getRecurring(userId: string): ProspectiveMemory[] {
    const prospectives = this.store.getProspectives(userId);
    return prospectives.filter(p => p.recurrence !== undefined && p.recurrence !== null);
  }

  /**
   * Calcula la próxima ocurrencia de una memoria recurrente
   */
  calculateNextOccurrence(prospective: ProspectiveMemory): Date | null {
    if (!prospective.recurrence || !prospective.dueDate) {
      return null;
    }

    const current = new Date(prospective.nextOccurrence || prospective.dueDate);
    const rule = prospective.recurrence;
    let next = new Date(current);

    switch (rule.frequency) {
      case 'daily':
        next.setDate(next.getDate() + rule.interval);
        break;

      case 'weekly':
        next.setDate(next.getDate() + (7 * rule.interval));
        break;

      case 'monthly':
        next.setMonth(next.getMonth() + rule.interval);
        break;

      case 'yearly':
        next.setFullYear(next.getFullYear() + rule.interval);
        break;
    }

    // Verificar si hay límite de ocurrencias o fecha de fin
    if (rule.endDate && next > new Date(rule.endDate)) {
      return null;
    }

    return next;
  }

  /**
   * Marca una memoria como completada
   */
  markCompleted(userId: string, id: string): void {
    const prospective = this.getProspective(userId, id);

    if (!prospective) {
      logger.warn('Prospective not found for completion', { userId, id });
      return;
    }

    // Si es recurrente, calcular próxima ocurrencia
    if (prospective.recurrence) {
      const nextOccurrence = this.calculateNextOccurrence(prospective);

      if (nextOccurrence) {
        // Actualizar para próxima ocurrencia
        this.updateProspective(userId, id, {
          nextOccurrence,
          dueDate: nextOccurrence,
          lastMentioned: undefined,
          mentionCount: 0
        });

        logger.info('Recurring prospective updated to next occurrence', {
          userId,
          id,
          nextOccurrence
        });
        return;
      }
    }

    // Si no es recurrente o ya no hay más ocurrencias, marcar como completada
    this.updateProspective(userId, id, {
      status: 'completed',
      completedAt: new Date()
    });

    logger.info('Prospective marked as completed', { userId, id });
  }

  /**
   * Marca una memoria como cancelada
   */
  markCancelled(userId: string, id: string): void {
    this.updateProspective(userId, id, {
      status: 'cancelled',
      updatedAt: new Date()
    });

    logger.info('Prospective marked as cancelled', { userId, id });
  }

  /**
   * Actualiza el estado de una memoria
   */
  updateStatus(userId: string, id: string, status: ProspectiveStatus): void {
    this.updateProspective(userId, id, { status });
  }

  /**
   * Busca memorias por contenido
   */
  searchByContent(userId: string, query: string): ProspectiveMemory[] {
    const prospectives = this.store.getProspectives(userId);
    const lowerQuery = query.toLowerCase();

    return prospectives.filter(p =>
      p.content.toLowerCase().includes(lowerQuery) ||
      (p.context && p.context.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Obtiene memorias por categoría
   */
  getByCategory(userId: string, category: ProspectiveCategory): ProspectiveMemory[] {
    const prospectives = this.store.getProspectives(userId);
    return prospectives.filter(p => p.category === category);
  }

  /**
   * Obtiene memorias por tipo
   */
  getByType(userId: string, type: ProspectiveType): ProspectiveMemory[] {
    const prospectives = this.store.getProspectives(userId);
    return prospectives.filter(p => p.type === type);
  }

  /**
   * Incrementa el contador de menciones
   */
  incrementMentionCount(userId: string, id: string): void {
    const prospective = this.getProspective(userId, id);

    if (prospective) {
      this.updateProspective(userId, id, {
        lastMentioned: new Date(),
        mentionCount: prospective.mentionCount + 1
      });
    }
  }
}
