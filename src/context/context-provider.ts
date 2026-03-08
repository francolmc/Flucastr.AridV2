/**
 * Context Provider
 *
 * Provee contexto temporal y espacial del usuario para respuestas
 * más naturales y conectadas al contexto actual.
 *
 * El contexto incluye:
 * - Temporal: fecha, hora, momento del día
 * - Espacial: ciudad, país, zona horaria
 */

import type { Profile } from '../config/types.js';
import type { TemporalContext, SpatialContext, UserContext } from './types.js';
import {
  formatDate,
  formatTime,
  getDayOfWeek,
  getPartOfDay,
  getTimezoneOffset,
} from './timezone-utils.js';

/**
 * ContextProvider
 *
 * Obtiene y combina información temporal y espacial del usuario
 */
export class ContextProvider {
  /**
   * Obtiene el contexto temporal basado en la zona horaria del usuario
   *
   * @param timezone - Zona horaria del usuario (default: 'UTC')
   * @returns Contexto temporal con fecha, hora y período del día
   *
   * @example
   * ```ts
   * const temporal = ContextProvider.getTemporal('America/Argentina/Buenos_Aires');
   * console.log(temporal.partOfDay); // => "tarde"
   * console.log(temporal.dateFormatted); // => "viernes, 8 de marzo de 2026"
   * ```
   */
  static getTemporal(timezone: string = 'UTC'): TemporalContext {
    const now = new Date();

    return {
      currentDateTime: now,
      dateFormatted: formatDate(now, timezone),
      timeFormatted: formatTime(now, timezone),
      dayOfWeek: getDayOfWeek(now, timezone),
      partOfDay: getPartOfDay(now, timezone),
      timezone,
      timezoneOffset: getTimezoneOffset(timezone),
    };
  }

  /**
   * Obtiene el contexto espacial desde el perfil del usuario
   *
   * @param profile - Perfil del usuario con información de ubicación
   * @returns Contexto espacial con ciudad, país y timezone
   *
   * @example
   * ```ts
   * const spatial = ContextProvider.getSpatial(profile);
   * console.log(spatial.city); // => "Buenos Aires"
   * console.log(spatial.country); // => "Argentina"
   * ```
   */
  static getSpatial(profile: Profile): SpatialContext {
    return {
      city: profile.city,
      country: profile.country,
      timezone: profile.timezone || 'UTC',
    };
  }

  /**
   * Obtiene el contexto completo del usuario (temporal + espacial)
   *
   * Este método combina información de ubicación del perfil con
   * información temporal actual según la zona horaria del usuario.
   *
   * @param profile - Perfil del usuario
   * @returns Contexto completo con información temporal y espacial
   *
   * @example
   * ```ts
   * const context = ContextProvider.getContext(profile);
   * console.log(context.temporal.partOfDay); // => "tarde"
   * console.log(context.spatial.city); // => "Buenos Aires"
   * ```
   */
  static getContext(profile: Profile): UserContext {
    const spatial = this.getSpatial(profile);
    const temporal = this.getTemporal(spatial.timezone);

    return { temporal, spatial };
  }
}
