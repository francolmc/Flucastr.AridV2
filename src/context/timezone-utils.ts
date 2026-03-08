/**
 * Timezone Utils
 *
 * Utilidades para manejar zonas horarias, formateo de fechas/horas
 * y cálculo de períodos del día.
 *
 * Utiliza Intl.DateTimeFormat nativo (sin dependencias externas)
 * para formateo localizado en español.
 */

/**
 * Obtiene la fecha actual en la zona horaria especificada
 * Returns a Date object representing "today" in the specified timezone
 *
 * @param timezone - Zona horaria (ej: "America/Santiago")
 * @returns Objeto Date con la fecha actual en la zona horaria especificada
 */
export function getTodayInTimezone(timezone: string): Date {
  const now = new Date();

  // Obtener partes de la fecha EN LA ZONA HORARIA DEL USUARIO
  const formatter = new Intl.DateTimeFormat('es', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  });

  const parts = formatter.formatToParts(now);
  const dateObj: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      dateObj[part.type] = part.value;
    }
  }

  // Construir una fecha local: año-mes-día a las 00:00:00
  return new Date(
    parseInt(dateObj.year),
    parseInt(dateObj.month) - 1,
    parseInt(dateObj.day),
    0,
    0,
    0,
    0
  );
}

/**
 * Formatea una fecha según la zona horaria especificada
 *
 * @param date - Fecha a formatear
 * @param timezone - Zona horaria (ej: "America/Argentina/Buenos_Aires")
 * @returns Fecha formateada en español (ej: "viernes, 8 de marzo de 2026")
 *
 * @example
 * ```ts
 * formatDate(new Date(), "America/Argentina/Buenos_Aires")
 * // => "viernes, 8 de marzo de 2026"
 * ```
 */
export function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).format(date);
}

/**
 * Formatea la hora según la zona horaria especificada
 *
 * @param date - Fecha a formatear
 * @param timezone - Zona horaria
 * @returns Hora formateada en formato 24h (ej: "14:30")
 *
 * @example
 * ```ts
 * formatTime(new Date(), "America/Argentina/Buenos_Aires")
 * // => "14:30"
 * ```
 */
export function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('es', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(date);
}

/**
 * Obtiene el día de la semana en español
 *
 * @param date - Fecha
 * @param timezone - Zona horaria
 * @returns Día de la semana (ej: "viernes")
 *
 * @example
 * ```ts
 * getDayOfWeek(new Date(), "America/Argentina/Buenos_Aires")
 * // => "viernes"
 * ```
 */
export function getDayOfWeek(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('es', {
    weekday: 'long',
    timeZone: timezone,
  }).format(date);
}

/**
 * Determina el período del día según la hora local
 *
 * Períodos:
 * - mañana: 6:00 - 11:59
 * - tarde: 12:00 - 19:59
 * - noche: 20:00 - 5:59
 *
 * @param date - Fecha
 * @param timezone - Zona horaria
 * @returns Período del día
 *
 * @example
 * ```ts
 * getPartOfDay(new Date("2026-03-08T14:30:00"), "America/Argentina/Buenos_Aires")
 * // => "tarde"
 * ```
 */
export function getPartOfDay(
  date: Date,
  timezone: string
): 'mañana' | 'tarde' | 'noche' {
  // Obtener la hora en la zona horaria del usuario
  const formatter = new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone,
  });

  const parts = formatter.formatToParts(date);
  const hourPart = parts.find((p) => p.type === 'hour');
  const hour = hourPart ? parseInt(hourPart.value, 10) : 0;

  // Clasificar según rangos
  if (hour >= 6 && hour < 12) return 'mañana';
  if (hour >= 12 && hour < 20) return 'tarde';
  return 'noche';
}

/**
 * Obtiene el offset de la zona horaria en formato UTC±N
 *
 * @param timezone - Zona horaria
 * @returns Offset en formato "UTC±N" (ej: "UTC-3", "UTC+2")
 *
 * @example
 * ```ts
 * getTimezoneOffset("America/Argentina/Buenos_Aires")
 * // => "UTC-3" (o "GMT-3" dependiendo del sistema)
 * ```
 */
export function getTimezoneOffset(timezone: string): string {
  const now = new Date();

  try {
    // Intentar obtener el offset usando timeZoneName
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });

    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');

    if (offsetPart && offsetPart.value) {
      return offsetPart.value;
    }

    // Fallback: calcular manualmente el offset
    return calculateTimezoneOffset(now, timezone);
  } catch {
    return 'UTC';
  }
}

/**
 * Calcula manualmente el offset de timezone
 * (fallback si shortOffset no está disponible)
 *
 * @param date - Fecha de referencia
 * @param timezone - Zona horaria
 * @returns Offset en formato "UTC±N"
 */
function calculateTimezoneOffset(date: Date, timezone: string): string {
  try {
    // Obtener la hora en UTC
    const utcDate = new Date(
      date.toLocaleString('en-US', { timeZone: 'UTC' })
    );

    // Obtener la hora en la zona horaria objetivo
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));

    // Calcular diferencia en horas
    const diffMs = tzDate.getTime() - utcDate.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));

    if (diffHours === 0) return 'UTC';
    if (diffHours > 0) return `UTC+${diffHours}`;
    return `UTC${diffHours}`; // ya incluye el signo negativo
  } catch {
    return 'UTC';
  }
}

/**
 * Valida que una zona horaria sea válida según IANA Time Zone Database
 *
 * @param timezone - Zona horaria a validar
 * @returns true si es válida, false en caso contrario
 *
 * @example
 * ```ts
 * isValidTimezone("America/Argentina/Buenos_Aires") // => true
 * isValidTimezone("Invalid/Timezone") // => false
 * ```
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    // Intl.DateTimeFormat lanza error si timezone es inválido
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
