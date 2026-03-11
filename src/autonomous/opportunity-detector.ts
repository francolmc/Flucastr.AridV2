import { logger } from '../utils/logger.js';
import { PatternDetector } from './pattern-detector.js';
import { ProspectiveMemoryStore } from '../storage/prospective-memory.store.js';
import { SkillStore } from '../storage/skill.store.js';

export interface DetectedOpportunity {
  id: string;
  userId: string;
  skillName: string;
  title: string;
  description: string;
  confidence: number; // 0.0-1.0
  factors: string[]; // Por qué se sugiere: ["pattern_detected", "overdue_work", "long_inactivity"]
  timestamp: Date;
  bestWindow?: 'now' | 'in_5min' | 'in_15min' | 'in_30min' | 'in_1hour'; // Cuándo sugerir
  context: Record<string, any>; // Detalles: { currentTime, lastActivity, relatedTasks, etc }
}

export class OpportunityDetector {
  constructor(
    private patternDetector: PatternDetector,
    private prospectiveStore: ProspectiveMemoryStore,
    private skillStore: SkillStore,
    private lastActivityTracker: Map<string, Map<string, Date>> = new Map()
  ) {}

  async detectOpportunities(userId: string): Promise<DetectedOpportunity[]> {
    try {
      const opportunities: DetectedOpportunity[] = [];
      const availableSkills = await this.skillStore.listAvailableSkills();

      for (const skill of availableSkills) {
        if (!skill.autonomousTriggers || skill.autonomousTriggers.length === 0) {
          continue;
        }

        const opportunity = await this.analyzeSkillOpportunity(userId, skill.name);
        if (opportunity && opportunity.confidence > 0.5) {
          opportunities.push(opportunity);
        }
      }

      opportunities.sort((a, b) => b.confidence - a.confidence);

      return opportunities;
    } catch (error) {
      logger.error('Error detecting opportunities', { userId, error });
      return [];
    }
  }

  private async analyzeSkillOpportunity(
    userId: string,
    skillName: string
  ): Promise<DetectedOpportunity | null> {
    const factors: string[] = [];
    let confidence = 0;
    const now = new Date();
    const context: Record<string, any> = {
      currentTime: now.toLocaleTimeString(),
      skillName,
    };
    const patternMatch = this.checkPatternOpportunity(userId, skillName);
    if (patternMatch.matched) {
      factors.push('pattern_detected');
      confidence += 0.3;
      context.patternReason = patternMatch.reason;
    }
    const relatedTasks = this.prospectiveStore
      .getUpcoming(userId, 7)
      .filter((task: any) => {
        const content = task.content.toLowerCase();
        const skillKey = skillName.toLowerCase();
        return content.includes(skillKey) || this.isRelatedToSkill(task, skillName);
      });

    if (relatedTasks.length > 0) {
      factors.push('overdue_work');
      confidence += 0.25;
      context.relatedTasksCount = relatedTasks.length;
      context.relatedTasks = relatedTasks.slice(0, 3).map((t: any) => t.content);
    }
    const lastActivity = this.getLastActivity(userId, skillName);
    const hoursSinceActivity = lastActivity
      ? (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60)
      : 0;

    if (hoursSinceActivity > 2) {
      factors.push('long_inactivity');
      confidence += 0.2;
      context.hoursSinceActivity = hoursSinceActivity.toFixed(1);
    }
    const pendingUpdates = await this.checkSkillUpdates(skillName);
    if (pendingUpdates.count > 0) {
      factors.push('skill_updates_waiting');
      confidence += 0.25;
      context.pendingUpdates = pendingUpdates;
    }
    if (factors.length === 0 || confidence < 0.3) {
      return null;
    }

    const bestWindow = this.calculateBestWindow(factors, context);

    return {
      id: `opportunity-${userId}-${skillName}-${Date.now()}`,
      userId,
      skillName,
      title: `💡 ${this.getTitleForSkill(skillName)}`,
      description: this.generateDescription(skillName, factors, context),
      confidence: Math.min(1, confidence),
      factors,
      timestamp: now,
      bestWindow,
      context,
    };
  }

  private checkPatternOpportunity(
    userId: string,
    skillName: string
  ): { matched: boolean; reason?: string } {
    // En una versión real, esto integraría con PatternDetector
    // Por ahora, retornar lógica simple:

    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay();
    if (skillName.includes('github') && hour >= 8 && hour <= 10) {
      return { matched: true, reason: 'GitHub activity pattern detected (typical morning check)' };
    }
    if (skillName.includes('gmail') && hour >= 8 && hour <= 9) {
      return { matched: true, reason: 'Email check pattern (typical morning routine)' };
    }
    if (skillName.includes('crypto') && hour >= 12 && hour <= 14) {
      return { matched: true, reason: 'Market check pattern (typical afternoon)' };
    }

    return { matched: false };
  }

  private getLastActivity(userId: string, skillName: string): Date | null {
    if (!this.lastActivityTracker.has(userId)) {
      return null;
    }
    return this.lastActivityTracker.get(userId)!.get(skillName) || null;
  }

  recordActivity(userId: string, skillName: string): void {
    if (!this.lastActivityTracker.has(userId)) {
      this.lastActivityTracker.set(userId, new Map());
    }
    this.lastActivityTracker.get(userId)!.set(skillName, new Date());
  }

  private isRelatedToSkill(task: any, skillName: string): boolean {
    const content = (task.content || '').toLowerCase();
    const skillMappings: Record<string, string[]> = {
      github: ['pr', 'pull request', 'issue', 'commit', 'push', 'fork'],
      gmail: ['email', 'mail', 'inbox', 'draft', 'send'],
      'home-assistant': ['home', 'smart', 'automation', 'device', 'light', 'temperature'],
      crypto: ['bitcoin', 'ethereum', 'wallet', 'trade', 'market', 'portfolio'],
      'dont-financio': ['finance', 'invoice', 'payment', 'budget', 'expense'],
    };

    const keywords = skillMappings[skillName.toLowerCase()] || [];
    return keywords.some((kw) => content.includes(kw));
  }

  private async checkSkillUpdates(
    skillName: string
  ): Promise<{ count: number; examples: string[] }> {
    return { count: 0, examples: [] };
  }

  private calculateBestWindow(factors: string[], context: any): 'now' | 'in_5min' | 'in_15min' {
    // Si hay patrón + trabajo + inactividad = sugerir AHORA
    if (factors.includes('pattern_detected') && factors.includes('overdue_work')) {
      return 'now';
    }
    if (factors.length >= 2) {
      return 'in_5min';
    }

    return 'in_15min';
  }

  /**
   * Genera título para oportunidad
   */
  private getTitleForSkill(skillName: string): string {
    const titles: Record<string, string> = {
      github: 'Revisar GitHub',
      gmail: 'Leer emails',
      'home-assistant': 'Controlar home',
      crypto: 'Revisar mercado',
      'dont-financio': 'Chequear finanzas',
    };
    return titles[skillName.toLowerCase()] || `Revisar ${skillName}`;
  }

  /**
   * Genera descripción de oportunidad
   */
  private generateDescription(
    skillName: string,
    factors: string[],
    context: any
  ): string {
    const parts: string[] = [];

    if (factors.includes('pattern_detected')) {
      parts.push(`📊 Patrón detectado: ${context.patternReason}`);
    }

    if (factors.includes('overdue_work')) {
      parts.push(
        `📋 Tienes ${context.relatedTasksCount} tarea(s) relacionada(s): ${context.relatedTasks?.[0] || 'pendiente'}`
      );
    }

    if (factors.includes('long_inactivity')) {
      parts.push(`⏱️ Hace ${context.hoursSinceActivity} horas que no revisas`);
    }

    if (factors.includes('skill_updates_waiting')) {
      parts.push(`🔔 ${context.pendingUpdates?.count || 1} actualizacion(es) esperando`);
    }

    return parts.join('\n');
  }
}
