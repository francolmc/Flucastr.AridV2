/**
 * Context Types
 *
 * Define las interfaces para el contexto temporal y espacial del usuario.
 * Estos tipos permiten que el asistente tenga conciencia de cuándo y dónde
 * se encuentra el usuario para respuestas más naturales y contextuales.
 */

/**
 * Contexto temporal del usuario
 * Incluye información sobre la fecha, hora y momento del día actual
 */
export interface TemporalContext {
  /** Fecha y hora actual como objeto Date */
  currentDateTime: Date;

  /** Fecha formateada en español (ej: "Viernes 8 de Marzo, 2026") */
  dateFormatted: string;

  /** Hora formateada en español (ej: "14:30") */
  timeFormatted: string;

  /** Día de la semana en español (ej: "Viernes") */
  dayOfWeek: string;

  /** Parte del día (mañana: 6-12, tarde: 12-20, noche: 20-6) */
  partOfDay: 'mañana' | 'tarde' | 'noche';

  /** Zona horaria del usuario (ej: "America/Argentina/Buenos_Aires") */
  timezone: string;

  /** Offset de la zona horaria (ej: "UTC-3") */
  timezoneOffset: string;
}

/**
 * Contexto espacial del usuario
 * Incluye información sobre la ubicación geográfica
 */
export interface SpatialContext {
  /** Ciudad del usuario (ej: "Buenos Aires") */
  city?: string;

  /** País del usuario (ej: "Argentina") */
  country?: string;

  /** Zona horaria del usuario */
  timezone: string;
}

/**
 * Contexto completo del usuario
 * Combina información temporal y espacial
 */
export interface UserContext {
  /** Contexto temporal (cuándo) */
  temporal: TemporalContext;

  /** Contexto espacial (dónde) */
  spatial: SpatialContext;
}
