/**
 * Simple Logger Utility
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private minLevel: LogLevel = 'info';

  setLevel(level: LogLevel) {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private format(level: LogLevel, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  debug(message: string, meta?: any) {
    if (this.shouldLog('debug')) {
      console.debug(this.format('debug', message, meta));
    }
  }

  info(message: string, meta?: any) {
    if (this.shouldLog('info')) {
      console.info(this.format('info', message, meta));
    }
  }

  warn(message: string, meta?: any) {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', message, meta));
    }
  }

  error(message: string, error?: any) {
    if (this.shouldLog('error')) {
      const meta = error instanceof Error ? {
        message: error.message,
        stack: error.stack
      } : error;
      console.error(this.format('error', message, meta));
    }
  }
}

export const logger = new Logger();
