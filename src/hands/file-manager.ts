import fs from 'node:fs/promises';
import path from 'node:path';
import { ToolExecutionError } from '../utils/errors.js';
import { SecurityValidator } from './security-validator.js';
import { logger } from '../utils/logger.js';

/**
 * FileManager - Maneja operaciones de archivos con seguridad
 *
 * Responsabilidades:
 * - Leer archivos dentro del workspace
 * - Escribir archivos (crear directorios si necesario)
 * - Listar contenido de directorios
 * - Validar paths (prevenir traversal y acceso a sistema)
 *
 * COMPONENTE CRÍTICO DE SEGURIDAD
 */
export class FileManager {
  private readonly securityValidator: SecurityValidator;
  private readonly workspacePath: string;
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  constructor(workspacePath: string) {
    this.securityValidator = new SecurityValidator();
    this.workspacePath = workspacePath;

    logger.info('FileManager initialized', {
      workspacePath: this.workspacePath,
      maxFileSize: this.MAX_FILE_SIZE,
    });
  }

  /**
   * Lee el contenido de un archivo
   * @param filePath Path relativo al workspace
   * @returns Contenido del archivo
   * @throws ToolExecutionError si el path es inseguro o el archivo no existe
   */
  async readFile(filePath: string): Promise<string> {
    logger.info('Reading file', { filePath });

    // Validar path
    const absolutePath = this.securityValidator.validatePath(
      filePath,
      this.workspacePath
    );

    try {
      // Verificar que el archivo existe y es un archivo (no directorio)
      const stats = await fs.stat(absolutePath);

      if (!stats.isFile()) {
        throw new ToolExecutionError(
          `El path "${filePath}" no es un archivo.`
        );
      }

      // Verificar tamaño
      if (stats.size > this.MAX_FILE_SIZE) {
        throw new ToolExecutionError(
          `El archivo "${filePath}" excede el tamaño máximo de ${this.MAX_FILE_SIZE / 1024 / 1024}MB.`
        );
      }

      // Leer contenido
      const content = await fs.readFile(absolutePath, 'utf-8');

      logger.info('File read successfully', {
        filePath,
        size: stats.size,
        lines: content.split('\n').length,
      });

      return content;
    } catch (error: any) {
      if (error instanceof ToolExecutionError) {
        throw error;
      }

      if (error.code === 'ENOENT') {
        throw new ToolExecutionError(
          `El archivo "${filePath}" no existe.`
        );
      }

      if (error.code === 'EACCES') {
        throw new ToolExecutionError(
          `No hay permisos para leer el archivo "${filePath}".`
        );
      }

      throw new ToolExecutionError(
        `Error leyendo archivo: ${error.message}`
      );
    }
  }

  /**
   * Escribe contenido a un archivo (crea directorios si necesario)
   * @param filePath Path relativo al workspace
   * @param content Contenido a escribir
   * @throws ToolExecutionError si el path es inseguro
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    logger.info('Writing file', { filePath, contentLength: content.length });

    // Validar path
    const absolutePath = this.securityValidator.validatePath(
      filePath,
      this.workspacePath
    );

    // Verificar tamaño del contenido
    const contentSize = Buffer.byteLength(content, 'utf-8');
    if (contentSize > this.MAX_FILE_SIZE) {
      throw new ToolExecutionError(
        `El contenido excede el tamaño máximo de ${this.MAX_FILE_SIZE / 1024 / 1024}MB.`
      );
    }

    try {
      // Crear directorios padre si no existen
      const directory = path.dirname(absolutePath);
      await fs.mkdir(directory, { recursive: true });

      // Escribir archivo
      await fs.writeFile(absolutePath, content, 'utf-8');

      logger.info('File written successfully', {
        filePath,
        size: contentSize,
      });
    } catch (error: any) {
      if (error instanceof ToolExecutionError) {
        throw error;
      }

      if (error.code === 'EACCES') {
        throw new ToolExecutionError(
          `No hay permisos para escribir el archivo "${filePath}".`
        );
      }

      throw new ToolExecutionError(
        `Error escribiendo archivo: ${error.message}`
      );
    }
  }

  /**
   * Lista el contenido de un directorio
   * @param dirPath Path relativo al workspace
   * @returns Array de nombres de archivos/directorios
   * @throws ToolExecutionError si el path es inseguro o no es un directorio
   */
  async listDirectory(dirPath: string = '.'): Promise<string[]> {
    logger.info('Listing directory', { dirPath });

    // Validar path
    const absolutePath = this.securityValidator.validatePath(
      dirPath,
      this.workspacePath
    );

    try {
      // Verificar que es un directorio
      const stats = await fs.stat(absolutePath);

      if (!stats.isDirectory()) {
        throw new ToolExecutionError(
          `El path "${dirPath}" no es un directorio.`
        );
      }

      // Leer contenido del directorio
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });

      // Formatear como "nombre/ (directorio)" o "nombre (archivo)"
      const formatted = entries.map((entry) => {
        if (entry.isDirectory()) {
          return `${entry.name}/`;
        }
        return entry.name;
      });

      logger.info('Directory listed successfully', {
        dirPath,
        entries: formatted.length,
      });

      return formatted.sort();
    } catch (error: any) {
      if (error instanceof ToolExecutionError) {
        throw error;
      }

      if (error.code === 'ENOENT') {
        throw new ToolExecutionError(
          `El directorio "${dirPath}" no existe.`
        );
      }

      if (error.code === 'EACCES') {
        throw new ToolExecutionError(
          `No hay permisos para leer el directorio "${dirPath}".`
        );
      }

      throw new ToolExecutionError(
        `Error listando directorio: ${error.message}`
      );
    }
  }

  /**
   * Verifica si un archivo o directorio existe
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      const absolutePath = this.securityValidator.validatePath(
        filePath,
        this.workspacePath
      );
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obtiene información sobre el workspace
   */
  getWorkspacePath(): string {
    return this.workspacePath;
  }
}
