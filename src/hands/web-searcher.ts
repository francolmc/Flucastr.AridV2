import { ToolExecutionError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface TavilyResponse {
  results: TavilySearchResult[];
  query: string;
}

/**
 * WebSearcher - Búsqueda web con Tavily API
 *
 * Responsabilidades:
 * - Buscar información actualizada en internet
 * - Formatear resultados para consumo del LLM
 * - Manejar límites de API y errores
 */
export class WebSearcher {
  private readonly apiKey?: string;
  private readonly API_URL = 'https://api.tavily.com/search';
  private readonly MAX_RESULTS = 5;
  private readonly TIMEOUT_MS = 10000; // 10 segundos

  constructor(apiKey?: string) {
    this.apiKey = apiKey;

    if (!apiKey) {
      logger.warn('WebSearcher initialized without API key - searches will fail');
    } else {
      logger.info('WebSearcher initialized with API key');
    }
  }

  /**
   * Busca información en internet
   * @param query Búsqueda a realizar
   * @returns Resultados formateados como string
   * @throws ToolExecutionError si no hay API key o la búsqueda falla
   */
  async search(query: string): Promise<string> {
    logger.info('Searching web', { query });

    if (!this.apiKey) {
      throw new ToolExecutionError(
        'No se configuró una API key de Tavily. Por favor, agrega TAVILY_API_KEY en el archivo .env para habilitar búsquedas web.'
      );
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query: query,
          max_results: this.MAX_RESULTS,
          search_depth: 'basic', // basic más rápido que advanced
          include_answer: false, // no necesitamos el resumen generado
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Tavily API error', {
          status: response.status,
          error: errorText,
        });

        if (response.status === 401) {
          throw new ToolExecutionError(
            'API key de Tavily inválida. Por favor, verifica tu configuración.'
          );
        }

        if (response.status === 429) {
          throw new ToolExecutionError(
            'Límite de búsquedas alcanzado. Por favor, intenta más tarde.'
          );
        }

        throw new ToolExecutionError(
          `Error en la búsqueda web (status ${response.status}).`
        );
      }

      const data = (await response.json()) as TavilyResponse;

      if (!data.results || data.results.length === 0) {
        logger.info('No results found', { query });
        return `No se encontraron resultados para: "${query}"`;
      }

      // Formatear resultados
      const formatted = this.formatResults(query, data.results);

      logger.info('Search completed successfully', {
        query,
        resultsCount: data.results.length,
      });

      return formatted;
    } catch (error: any) {
      if (error instanceof ToolExecutionError) {
        throw error;
      }

      if (error.name === 'AbortError') {
        throw new ToolExecutionError(
          `La búsqueda excedió el tiempo límite de ${this.TIMEOUT_MS / 1000}s.`
        );
      }

      logger.error('Web search failed', { error });
      throw new ToolExecutionError(
        `Error realizando búsqueda web: ${error.message}`
      );
    }
  }

  /**
   * Formatea los resultados de búsqueda
   */
  private formatResults(query: string, results: TavilySearchResult[]): string {
    let formatted = `Búsqueda: "${query}"\n\n`;
    formatted += `Encontrados ${results.length} resultados:\n\n`;

    results.forEach((result, index) => {
      formatted += `${index + 1}. **${result.title}**\n`;
      formatted += `   ${result.url}\n`;
      formatted += `   ${this.truncateContent(result.content)}\n\n`;
    });

    return formatted.trim();
  }

  /**
   * Trunca el contenido a un tamaño razonable
   */
  private truncateContent(content: string, maxLength: number = 200): string {
    if (content.length <= maxLength) {
      return content;
    }

    return content.substring(0, maxLength) + '...';
  }

  /**
   * Verifica si el searcher está configurado
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}
