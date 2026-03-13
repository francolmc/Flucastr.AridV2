import path from 'node:path';
import { ToolExecutionError } from '../utils/errors.js';

/**
 * SecurityValidator - Validaciones de seguridad centralizadas
 *
 * Responsabilidades:
 * - Validar comandos contra lista negra
 * - Validar paths (prevenir traversal, acceso a sistema)
 * - Sanitizar entrada de usuario
 */
export class SecurityValidator {
  private readonly DANGEROUS_COMMANDS = [
    'rm -rf',
    'rm -fr',
    'rm -r /',
    'dd if=',
    'mkfs',
    '> /dev/sda',
    '> /dev/sd',
    'chmod -R 777',
    'chmod 777',
    'chown -R',
    ':(){:|:&};:', // fork bomb
    'wget | sh',
    'wget|sh',
    'curl | sh',
    'curl|sh',
    'shutdown',
    'reboot',
    'init 0',
    'init 6',
    'poweroff',
    'halt',
    'killall',
    'pkill -9',
    'kill -9 -1',
    ':(){ :|:& };:', // fork bomb variant
  ];

  private readonly DANGEROUS_PATTERNS = [
    /rm\s+-[rf]+\s+\//i,              // rm -rf /...
    /dd\s+if=/i,                       // dd if=...
    />\s*\/dev\//i,                    // > /dev/...
    /\|\s*(sh|bash|zsh|fish)/i,        // | sh, | bash
    /wget.*\|.*sh/i,                   // wget ... | sh
    /curl.*\|.*sh/i,                   // curl ... | sh
    /chmod\s+-R\s+777/i,               // chmod -R 777
    />\s*\/etc\//i,                    // > /etc/...
    />\s*\/sys\//i,                    // > /sys/...
  ];

  private readonly SYSTEM_PATHS = [
    '/etc',
    '/sys',
    '/proc',
    '/dev',
    '/root',
    '/boot',
    '/bin',
    '/sbin',
    '/usr/bin',
    '/usr/sbin',
  ];

  /**
   * Valida que un comando no sea peligroso
   * @throws ToolExecutionError si el comando es peligroso
   */
  validateCommand(command: string): void {
    const normalizedCommand = command.toLowerCase().trim();

    // Validar contra lista negra de comandos
    for (const dangerous of this.DANGEROUS_COMMANDS) {
      if (normalizedCommand.includes(dangerous.toLowerCase())) {
        throw new ToolExecutionError(
          `Comando peligroso detectado: "${dangerous}". Por seguridad, este comando no se ejecutará.`
        );
      }
    }

    // Validar contra patrones peligrosos
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        throw new ToolExecutionError(
          `Patrón peligroso detectado en comando. Por seguridad, este comando no se ejecutará.`
        );
      }
    }

    // Validar que no contenga pipes a shells
    if (/\|\s*(sh|bash|zsh|fish|perl|python|ruby|node)/i.test(command)) {
      throw new ToolExecutionError(
        'No se permite ejecutar pipes a shells o intérpretes. Por seguridad, este comando no se ejecutará.'
      );
    }
  }

  /**
   * Valida que un path sea seguro (dentro del workspace, no traversal)
   * @returns Path absoluto resuelto
   * @throws ToolExecutionError si el path es inseguro
   */
  validatePath(filePath: string, workspacePath: string): string {
    // Resolver path absoluto
    const resolvedPath = path.resolve(workspacePath, filePath);

    // Prevenir path traversal - verificar que esté dentro del workspace
    if (!resolvedPath.startsWith(workspacePath)) {
      throw new ToolExecutionError(
        `Acceso denegado: el path resuelto está fuera del directorio raíz permitido. ` +
        `Path solicitado: "${filePath}", Directorio raíz: "${workspacePath}". ` +
        `Ruta absoluta intenta: "${resolvedPath}". ` +
        `Nota: La carpeta workspace/ es completamente accesible para tus datos personales.`
      );
    }

    // Prevenir acceso a paths del sistema
    for (const systemPath of this.SYSTEM_PATHS) {
      if (resolvedPath.startsWith(systemPath)) {
        throw new ToolExecutionError(
          `Acceso denegado: no se puede acceder a paths del sistema (${systemPath}). ` +
          `Para trabajar con tus datos, usa rutas dentro del directorio raíz permitido.`
        );
      }
    }

    return resolvedPath;
  }

  /**
   * Sanitiza variables de entorno para no exponer credenciales
   */
  sanitizeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const sanitized = { ...env };

    // Lista de variables sensibles a eliminar
    const sensitiveKeys = [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
      'OPENAI_API_KEY',
      'TELEGRAM_TOKEN',
      'TAVILY_API_KEY',
      'DATABASE_URL',
      'DATABASE_PASSWORD',
      'PRIVATE_KEY',
      'SECRET_KEY',
      'API_SECRET',
    ];

    for (const key of sensitiveKeys) {
      if (key in sanitized) {
        delete sanitized[key];
      }
    }

    // También eliminar cualquier variable que contenga "TOKEN", "KEY", "SECRET", "PASSWORD"
    for (const key of Object.keys(sanitized)) {
      if (
        key.includes('TOKEN') ||
        key.includes('KEY') ||
        key.includes('SECRET') ||
        key.includes('PASSWORD')
      ) {
        delete sanitized[key];
      }
    }

    return sanitized;
  }
}
