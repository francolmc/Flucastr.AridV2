/**
 * SkillStore - Gestiona metadata de skills y operaciones de lectura/escritura
 * Skills se almacenan en el filesystem: workspace/skills/{skillName}/SKILL.md
 * Metadata se persiste en la DB para queries rápidas
 * Fase 9: Skills System
 */

import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { DB } from './db.js';
import { SkillMetadata, Skill } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';

export class SkillStore {
  constructor(private workspacePath: string) {}

  /**
   * Crear nuevo skill
   * Escribe SKILL.md en filesystem + guarda metadata en DB
   */
  async createSkill(
    userId: string,
    name: string,
    description: string,
    content: string,
    requiredEnv?: string[],
    autonomousTriggers?: string[]
  ): Promise<Skill> {
    try {
      const skillDir = join(this.workspacePath, 'skills', name);
      const skillFile = join(skillDir, 'SKILL.md');

      // Crear directorio
      await mkdir(skillDir, { recursive: true });

      // Escribir SKILL.md con frontmatter
      const yamlFrontmatter = this.generateYAMLFrontmatter({
        name,
        description,
        requiredEnv,
        autonomousTriggers,
      });

      const fullContent = `${yamlFrontmatter}\n\n${content}`;
      await writeFile(skillFile, fullContent, 'utf-8');

      // Guardar metadata en DB
      const metadata: SkillMetadata = {
        id: randomUUID(),
        userId,
        name,
        description,
        requiredEnv: requiredEnv || [],
        autonomousTriggers: autonomousTriggers || [],
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0,
      };

      const store = DB.getInstance();
      store.addSkill(userId, metadata);

      logger.info('Skill created', { userId, name, skillFile });

      return {
        metadata,
        content: fullContent,
        filePath: skillFile,
      };
    } catch (error) {
      logger.error('Failed to create skill', error);
      throw new StorageError(`Failed to create skill: ${error}`);
    }
  }

  /**
   * Leer un skill completo (metadata + content)
   * Extrae metadata directamente del SKILL.md, no depende de la DB
   */
  async readSkill(userId: string, skillName: string): Promise<Skill | null> {
    try {
      const skillFile = join(this.workspacePath, 'skills', skillName, 'SKILL.md');

      if (!existsSync(skillFile)) {
        logger.debug('Skill file not found', { skillName, filePath: skillFile });
        return null;
      }

      // Leer del filesystem
      const content = await readFile(skillFile, 'utf-8');

      // Extraer metadata del SKILL.md directamente
      const { metadata } = this.parseSkillContent(content);
      
      // Asegurar que el nombre es correcto
      const fullMetadata: SkillMetadata = {
        ...metadata,
        name: skillName,
        userId, // Añadir userId al metadata
      };

      logger.debug('Skill loaded from filesystem', { userId, skillName, hasRequiredEnv: (fullMetadata.requiredEnv?.length ?? 0) > 0 });

      return {
        metadata: fullMetadata,
        content,
        filePath: skillFile,
      };
    } catch (error) {
      logger.error('Failed to read skill', { skillName, error: String(error) });
      throw new StorageError(`Failed to read skill: ${error}`);
    }
  }

  /**
   * Actualizar un skill existente
   */
  async updateSkill(userId: string, skillName: string, updates: {
    description?: string;
    requiredEnv?: string[];
    autonomousTriggers?: string[];
    content?: string;
  }): Promise<Skill> {
    try {
      const skillFile = join(this.workspacePath, 'skills', skillName, 'SKILL.md');

      if (!existsSync(skillFile)) {
        throw new StorageError(`Skill not found: ${skillName}`);
      }

      // Leer skill actual
      const currentContent = await readFile(skillFile, 'utf-8');
      const store = DB.getInstance();
      const metadata = store.getSkill(userId, skillName);

      if (!metadata) {
        throw new StorageError(`Skill metadata not found: ${skillName}`);
      }

      // Actualizar metadata
      const updatedMetadata: SkillMetadata = {
        ...metadata,
        description: updates.description || metadata.description,
        requiredEnv: updates.requiredEnv || metadata.requiredEnv,
        autonomousTriggers: updates.autonomousTriggers !== undefined ? updates.autonomousTriggers : metadata.autonomousTriggers,
        updatedAt: new Date(),
      };

      // Actualizar content si se proporciona
      let newContent = updates.content || currentContent;

      // Regenerar frontmatter
      const yamlFrontmatter = this.generateYAMLFrontmatter({
        name: skillName,
        description: updatedMetadata.description,
        requiredEnv: updatedMetadata.requiredEnv,
        autonomousTriggers: updatedMetadata.autonomousTriggers,
      });

      // Extraer el body (todo después del frontmatter)
      const bodyMatch = newContent.match(/^---\n[\s\S]*?\n---\n\n([\s\S]*)$/);
      const body = bodyMatch ? bodyMatch[1] : newContent;

      newContent = `${yamlFrontmatter}\n\n${body}`;

      // Escribir archivo
      await writeFile(skillFile, newContent, 'utf-8');

      // Guardar metadata actualizada
      store.updateSkill(userId, skillName, updatedMetadata);

      logger.info('Skill updated', { userId, skillName });

      return {
        metadata: updatedMetadata,
        content: newContent,
        filePath: skillFile,
      };
    } catch (error) {
      logger.error('Failed to update skill', error);
      throw new StorageError(`Failed to update skill: ${error}`);
    }
  }

  /**
   * Eliminar un skill
   */
  async deleteSkill(userId: string, skillName: string): Promise<void> {
    try {
      const skillDir = join(this.workspacePath, 'skills', skillName);

      // Eliminar del filesystem
      if (existsSync(skillDir)) {
        await rm(skillDir, { recursive: true, force: true });
      }

      // Eliminar metadata de DB
      const store = DB.getInstance();
      store.deleteSkill(userId, skillName);

      logger.info('Skill deleted', { userId, skillName });
    } catch (error) {
      logger.error('Failed to delete skill', error);
      throw new StorageError(`Failed to delete skill: ${error}`);
    }
  }

  /**
   * Listar todos los skills disponibles en el filesystem
   * Independiente de la DB - busca directorios en workspace/skills/
   */
  async listAvailableSkills(): Promise<SkillMetadata[]> {
    try {
      const { readdirSync, statSync } = await import('fs');
      const skillsPath = join(this.workspacePath, 'skills');

      if (!existsSync(skillsPath)) {
        logger.warn('Skills directory not found', { path: skillsPath });
        return [];
      }

      const skillDirs = readdirSync(skillsPath).filter((f: string) => {
        const fullPath = join(skillsPath, f);
        try {
          const stat = statSync(fullPath);
          return stat.isDirectory();
        } catch (e) {
          return false;
        }
      });

      logger.debug('Found skill directories', { count: skillDirs.length, dirs: skillDirs });

      const skills: SkillMetadata[] = [];

      for (const skillDir of skillDirs) {
        try {
          const skillFile = join(skillsPath, skillDir, 'SKILL.md');
          if (!existsSync(skillFile)) {
            logger.debug('SKILL.md not found', { skillDir, path: skillFile });
            continue;
          }

          const content = await readFile(skillFile, 'utf-8');
          const { metadata } = this.parseSkillContent(content);

          // Usar nombre del directorio como nombre del skill
          const fullMetadata: SkillMetadata = {
            ...metadata,
            name: skillDir,
          };

          skills.push(fullMetadata);
          logger.debug('Loaded skill from filesystem', { skillDir, requiredEnv: metadata.requiredEnv });
        } catch (e) {
          logger.warn('Failed to parse skill from filesystem', { skillDir, error: String(e) });
        }
      }

      logger.info('Listed available skills from filesystem', { count: skills.length, skills: skills.map(s => s.name) });

      return skills;
    } catch (error) {
      logger.error('Failed to list available skills', { error: String(error) });
      return [];
    }
  }

  /**
   * Listar todos los skills de un usuario (solo metadata)
   */
  listSkills(userId: string): SkillMetadata[] {
    try {
      const store = DB.getInstance();
      return store.getSkills(userId) || [];
    } catch (error) {
      logger.error('Failed to list skills', error);
      return [];
    }
  }

  /**
   * Buscar skills por nombre o descripción
   */
  searchSkills(userId: string, query: string): SkillMetadata[] {
    try {
      // Primero intentar buscar en DB
      const dbSkills = this.listSkills(userId);
      const queryLower = query.toLowerCase();

      const dbMatches = dbSkills.filter(skill => {
        const matchName = skill.name.toLowerCase().includes(queryLower);
        const matchDesc = skill.description.toLowerCase().includes(queryLower);
        return matchName || matchDesc;
      });

      // Si hay resultados en DB, retornarlos
      if (dbMatches.length > 0) {
        return dbMatches;
      }

      // Si no hay en DB, buscar en filesystem de forma síncrona
      // Nota: se ejecuta de forma síncrona aquí, considerado aceptable para búsqueda rápida
      const fs = require('fs');
      const allSkills = fs.readdirSync(join(this.workspacePath, 'skills'))
        .filter((f: string) => {
          const stat = fs.statSync(join(this.workspacePath, 'skills', f));
          return stat.isDirectory();
        });

      const fsMatches: SkillMetadata[] = [];
      for (const skillDir of allSkills) {
        const skillFile = join(this.workspacePath, 'skills', skillDir, 'SKILL.md');
        if (!existsSync(skillFile)) continue;

        try {
          const content = fs.readFileSync(skillFile, 'utf-8');
          const { metadata } = this.parseSkillContent(content);
          
          if (skillDir.toLowerCase().includes(queryLower) ||
              metadata.description.toLowerCase().includes(queryLower)) {
            fsMatches.push({ ...metadata, name: skillDir });
          }
        } catch (e) {
          // Skip
        }
      }

      return fsMatches;
    } catch (error) {
      logger.error('Failed to search skills', error);
      return [];
    }
  }

  /**
   * Registrar uso de un skill (incrementa counter)
   */
  recordSkillUsage(userId: string, skillName: string): void {
    try {
      const store = DB.getInstance();
      const metadata = store.getSkill(userId, skillName);

      if (metadata) {
        metadata.usageCount += 1;
        metadata.lastUsed = new Date();
        store.updateSkill(userId, skillName, metadata);
      }
    } catch (error) {
      logger.warn('Failed to record skill usage', error);
    }
  }

  /**
   * Generar YAML frontmatter para SKILL.md
   */
  private generateYAMLFrontmatter(options: {
    name: string;
    description: string;
    requiredEnv?: string[];
    autonomousTriggers?: string[];
  }): string {
    const { name, description, requiredEnv, autonomousTriggers } = options;

    let yaml = '---\n';
    yaml += `name: ${name}\n`;
    yaml += `description: ${description}\n`;

    if (requiredEnv && requiredEnv.length > 0) {
      yaml += `required-env:\n`;
      for (const env of requiredEnv) {
        yaml += `  - ${env}\n`;
      }
    }

    if (autonomousTriggers && autonomousTriggers.length > 0) {
      yaml += `autonomous-triggers:\n`;
      for (const trigger of autonomousTriggers) {
        yaml += `  - ${trigger}\n`;
      }
    }

    yaml += '---';

    return yaml;
  }

  /**
   * Parsear SKILL.md: separar frontmatter de instrucciones
   * Retorna metadata del skill
   */
  private parseSkillContent(
    content: string
  ): { metadata: SkillMetadata; instructions: string } {
    try {
      // Buscar frontmatter: ---\n...\n---
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);

      if (!frontmatterMatch) {
        logger.warn('Skill missing YAML frontmatter');
        return {
          metadata: {
            id: randomUUID(),
            userId: '',
            name: 'unknown',
            description: '',
            requiredEnv: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            usageCount: 0,
          },
          instructions: content,
        };
      }

      const [, frontmatterStr, instructions] = frontmatterMatch;

      // Parsear YAML
      const metadata = this.parseYAMLFrontmatter(frontmatterStr);

      return {
        metadata,
        instructions,
      };
    } catch (error) {
      logger.error('Failed to parse skill content', error);
      throw new StorageError(`Failed to parse skill content: ${error}`);
    }
  }

  /**
   * Parsear YAML frontmatter simple (sin dependencias externas)
   */
  private parseYAMLFrontmatter(yaml: string): SkillMetadata {
    const lines = yaml.split('\n');
    const metadata: any = {
      id: randomUUID(),
      userId: '', // No userId para skills globales
      requiredEnv: [],
      usageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let currentKey: string | null = null;
    let inList = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) continue;

      // Detectar listas YAML (- item)
      if (trimmed.startsWith('- ')) {
        if (inList && currentKey) {
          if (!Array.isArray(metadata[currentKey])) {
            metadata[currentKey] = [];
          }
          metadata[currentKey].push(trimmed.slice(2).trim());
        }
        continue;
      }

      inList = false;

      // Detectar key-value (key: value)
      const match = trimmed.match(/^([^:]+):\s*(.*)/);
      if (!match) continue;

      const [, key, value] = match;
      
      // Convertir guiones a camelCase: required-env → requiredEnv
      let cleanKey = key.trim();
      if (cleanKey.includes('-')) {
        cleanKey = cleanKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      }

      if (value) {
        // Valor simple
        metadata[cleanKey] = value;
      } else {
        // Inicio de lista (para campos como required-env:)
        currentKey = cleanKey;
        inList = true;
      }
    }

    return metadata as SkillMetadata;
  }
}
