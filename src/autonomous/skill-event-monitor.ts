/**
 * Skill Event Monitor Coordinator - Fase 10
 * 
 * Coordina y ejecuta monitores externos de todos los skills
 * Permite que cualquier skill registre un monitor sin hardcodear nada
 * 
 * GENÉRICO:
 * - No sabe qué skills existen
 * - No sabe qué eventos monitorean
 * - Solo contiene los monitores que skills registran
 */

import { logger } from '../utils/logger.js';
import {
  IExternalEventMonitor,
  MonitorRegistration,
  ExternalEvent
} from './external-event-monitor.js';

export class SkillEventMonitor {
  private monitors: Map<string, MonitorRegistration> = new Map();
  private lastExecutionTime: Map<string, Date> = new Map();

  /**
   * Registra un monitor para que sea ejecutado periódicamente
   * Llamado por los skills al inicializar
   */
  async registerMonitor(
    monitorName: string,
    skillName: string,
    monitor: IExternalEventMonitor
  ): Promise<void> {
    try {
      // Validar que no exista uno con el mismo nombre
      if (this.monitors.has(monitorName)) {
        logger.warn('Monitor already registered, replacing', {
          monitorName,
          skillName
        });
      }

      // Inicializar el monitor
      await monitor.initialize();

      // Registrarlo
      const registration: MonitorRegistration = {
        monitorName,
        skillName,
        monitor,
        enabled: true,
        errorCount: 0
      };

      this.monitors.set(monitorName, registration);

      logger.info('Monitor registered', {
        monitorName,
        skillName,
        eventTypes: monitor.eventTypes.join(', ')
      });
    } catch (error) {
      logger.error('Error registering monitor', {
        monitorName,
        skillName,
        error
      });
      throw error;
    }
  }

  /**
   * Des-registra un monitor
   */
  async unregisterMonitor(monitorName: string): Promise<void> {
    try {
      const registration = this.monitors.get(monitorName);
      if (!registration) {
        logger.warn('Monitor not found for unregister', { monitorName });
        return;
      }

      // Limpieza
      if (registration.monitor.cleanup) {
        await registration.monitor.cleanup();
      }

      this.monitors.delete(monitorName);
      this.lastExecutionTime.delete(monitorName);

      logger.info('Monitor unregistered', {
        monitorName,
        skillName: registration.skillName
      });
    } catch (error) {
      logger.error('Error unregistering monitor', { monitorName, error });
    }
  }

  /**
   * Obtiene todos los monitores registrados
   */
  getMonitors(): MonitorRegistration[] {
    return Array.from(this.monitors.values());
  }

  /**
   * Obtiene monitores de un skill específico
   */
  getSkillMonitors(skillName: string): MonitorRegistration[] {
    return Array.from(this.monitors.values()).filter(m => m.skillName === skillName);
  }

  /**
   * Ejecuta todos los monitores habilitados
   * Retorna ALL eventos detectados
   */
  async checkAllMonitors(): Promise<ExternalEvent[]> {
    const allEvents: ExternalEvent[] = [];
    const enabledMonitors = Array.from(this.monitors.values()).filter(m => m.enabled);

    logger.debug('Checking all monitors', {
      monitorCount: enabledMonitors.length
    });

    for (const registration of enabledMonitors) {
      try {
        // Chequear health primero
        const isHealthy = await registration.monitor.isHealthy();
        if (!isHealthy) {
          logger.warn('Monitor health check failed, skipping', {
            monitorName: registration.monitorName,
            skillName: registration.skillName
          });
          continue;
        }

        // Ejecutar monitor
        const events = await registration.monitor.check();
        allEvents.push(...events);

        // Actualizar registro
        registration.lastCheck = new Date();
        registration.errorCount = 0;

        logger.debug('Monitor check completed', {
          monitorName: registration.monitorName,
          eventsFound: events.length
        });
      } catch (error) {
        registration.errorCount++;
        registration.lastError = String(error);

        logger.error('Error executing monitor', {
          monitorName: registration.monitorName,
          skillName: registration.skillName,
          errorCount: registration.errorCount,
          error
        });

        // Deshabilitar si hay muchos errores
        if (registration.errorCount >= 3) {
          logger.warn('Monitor disabled after 3 errors', {
            monitorName: registration.monitorName
          });
          registration.enabled = false;
        }
      }
    }

    return allEvents;
  }

  /**
   * Ejecuta monitores de un skill específico
   */
  async checkSkillMonitors(skillName: string): Promise<ExternalEvent[]> {
    const skillMonitors = this.getSkillMonitors(skillName);
    const allEvents: ExternalEvent[] = [];

    for (const registration of skillMonitors) {
      try {
        const isHealthy = await registration.monitor.isHealthy();
        if (!isHealthy) continue;

        const events = await registration.monitor.check();
        allEvents.push(...events);

        registration.lastCheck = new Date();
        registration.errorCount = 0;
      } catch (error) {
        registration.errorCount++;
        logger.error('Error checking skill monitor', {
          skillName,
          monitorName: registration.monitorName,
          error
        });
      }
    }

    return allEvents;
  }

  /**
   * Filtra eventos por severidad y tipo
   */
  filterEvents(
    events: ExternalEvent[],
    options?: {
      minSeverity?: 'low' | 'medium' | 'high' | 'urgent';
      eventTypes?: string[];
      skillName?: string;
      notifiableOnly?: boolean;
    }
  ): ExternalEvent[] {
    let filtered = [...events];

    if (options?.minSeverity) {
      const severityRank = { low: 0, medium: 1, high: 2, urgent: 3 };
      const minRank = severityRank[options.minSeverity];
      filtered = filtered.filter(e => severityRank[e.severity] >= minRank);
    }

    if (options?.eventTypes && options.eventTypes.length > 0) {
      filtered = filtered.filter(e => options.eventTypes!.includes(e.eventType));
    }

    if (options?.skillName) {
      filtered = filtered.filter(e => e.skillName === options.skillName);
    }

    if (options?.notifiableOnly) {
      filtered = filtered.filter(e => e.shouldNotify);
    }

    return filtered;
  }

  /**
   * Obtiene estadísticas de monitores
   */
  getStats(): {
    totalMonitors: number;
    enabledMonitors: number;
    totalErrors: number;
    bySkill: Record<string, { total: number; enabled: number }>;
  } {
    const monitors = Array.from(this.monitors.values());
    const stats = {
      totalMonitors: monitors.length,
      enabledMonitors: monitors.filter(m => m.enabled).length,
      totalErrors: monitors.reduce((sum, m) => sum + m.errorCount, 0),
      bySkill: {} as Record<string, { total: number; enabled: number }>
    };

    for (const monitor of monitors) {
      if (!stats.bySkill[monitor.skillName]) {
        stats.bySkill[monitor.skillName] = { total: 0, enabled: 0 };
      }
      stats.bySkill[monitor.skillName].total++;
      if (monitor.enabled) {
        stats.bySkill[monitor.skillName].enabled++;
      }
    }

    return stats;
  }

  /**
   * Cleanup: llamar al terminar la app
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up skill event monitors');
    for (const registration of this.monitors.values()) {
      if (registration.monitor.cleanup) {
        try {
          await registration.monitor.cleanup();
        } catch (error) {
          logger.error('Error cleaning up monitor', {
            monitorName: registration.monitorName,
            error
          });
        }
      }
    }
    this.monitors.clear();
  }
}
