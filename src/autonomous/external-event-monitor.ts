/**
 * External Event Monitor - Interfaz para monitoreo de eventos externos
 * 
 * Permite que skills monitoreen eventos de fuentes externas:
 * - Gmail: check inbox for new emails
 * - GitHub: poll for new PRs, CI failures
 * - Home Assistant: state changes
 * - Weather APIs: significant changes
 * - Etc.
 * 
 * ARQUITECTURA GENÉRICA:
 * - No hardcodea qué monitorear
 * - Cada skill implementa su propio monitor
 * - AutonomousEngine solo orquesta la ejecución
 */

export interface ExternalEvent {
  id: string;
  monitorName: string;        // "github_monitor", "gmail_monitor", etc.
  skillName: string;          // Skill propietario
  eventType: string;          // "new_pr", "new_email", "state_change", etc.
  severity: 'low' | 'medium' | 'high' | 'urgent'; // Para filtrar en interruptions
  title: string;              // Título del evento
  description: string;        // Descripción del evento
  data?: Record<string, any>; // Datos adicionales (URL, metadata, etc.)
  detectedAt: Date;           // Cuándo se detectó
  shouldNotify: boolean;      // Si debe generar notificación al usuario
}

/**
 * Monitor Base Interface
 * Los skills implementan esto para monitorear eventos externos
 */
export interface IExternalEventMonitor {
  /**
   * Nombre único del monitor (ej: "gmail_monitor", "github_monitor")
   */
  readonly monitorName: string;

  /**
   * Skill propietario de este monitor
   */
  readonly skillName: string;

  /**
   * Tipos de eventos que este monitor puede detectar
   * Ej: ["new_email", "important_email", "attachment"]
   */
  readonly eventTypes: string[];

  /**
   * Inicializa el monitor (si requiere setup)
   * Llamado una sola vez al arrancar
   */
  initialize(): Promise<void>;

  /**
   * Ejecuta el monitoreo
   * Retorna eventos detectados desde el último check
   */
  check(): Promise<ExternalEvent[]>;

  /**
   * Limpia recursos si es necesario
   */
  cleanup?(): Promise<void>;

  /**
   * Verifica si el monitor está disponible/funcional
   * Útil para chequear credenciales, conectividad, etc.
   */
  isHealthy(): Promise<boolean>;
}

/**
 * Monitor Registration - Registro de un monitor
 */
export interface MonitorRegistration {
  monitorName: string;
  skillName: string;
  monitor: IExternalEventMonitor;
  enabled: boolean;
  lastCheck?: Date;
  lastError?: string;
  errorCount: number;
}
