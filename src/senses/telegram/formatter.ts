/**
 * Telegram Formatter
 * Converts text to Telegram MarkdownV2 format
 */

import { logger } from '../../utils/logger.js';
import { MarkdownTranslator } from './markdown-translator.js';

export class TelegramFormatter {
  /**
   * Convert Markdown to Telegram MarkdownV2 format
   * Uses MarkdownTranslator to convert standard markdown to Telegram format
   */
  static toTelegramMarkdown(text: string): string {
    try {
      return MarkdownTranslator.translateToTelegram(text);
    } catch (error) {
      logger.error('Failed to translate markdown', error);
      // Fallback: return plain text version
      return this.toPlainText(text);
    }
  }

  /**
   * Convert to plain text (escape all special characters without formatting)
   * Used as fallback when MarkdownV2 fails
   */
  static toPlainText(text: string): string {
    // Escape all MarkdownV2 special characters
    return text
      .replace(/\\/g, '\\\\')
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/-/g, '\\-')
      .replace(/=/g, '\\=')
      .replace(/\|/g, '\\|')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/!/g, '\\!');
  }

  /**
   * Split long messages into chunks (Telegram has 4096 char limit)
   */
  static splitMessage(text: string, maxLength: number = 4000): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    let currentChunk = '';

    const lines = text.split('\n');

    for (const line of lines) {
      if ((currentChunk + line + '\n').length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        // If single line is too long, split it
        if (line.length > maxLength) {
          let start = 0;
          while (start < line.length) {
            chunks.push(line.slice(start, start + maxLength));
            start += maxLength;
          }
        } else {
          currentChunk = line + '\n';
        }
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Format token stats for display
   */
  static formatTokenStats(stats: {
    totalInput: number;
    totalOutput: number;
    totalMessages: number;
    byProvider: Record<string, { input: number; output: number; messages: number }>;
  }): string {
    let message = '📊 **Estadísticas de Uso**\n\n';
    message += `**Total:**\n`;
    message += `- Mensajes: ${stats.totalMessages}\n`;
    message += `- Tokens entrada: ${stats.totalInput.toLocaleString()}\n`;
    message += `- Tokens salida: ${stats.totalOutput.toLocaleString()}\n`;
    message += `- Total tokens: ${(stats.totalInput + stats.totalOutput).toLocaleString()}\n\n`;

    message += `**Por Proveedor:**\n`;
    for (const [provider, data] of Object.entries(stats.byProvider)) {
      message += `\n*${provider}*:\n`;
      message += `- Mensajes: ${data.messages}\n`;
      message += `- Entrada: ${data.input.toLocaleString()} | Salida: ${data.output.toLocaleString()}\n`;
    }

    return message;
  }
}
