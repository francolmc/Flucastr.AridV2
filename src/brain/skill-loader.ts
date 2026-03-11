/**
 * SkillLoader - Carga progresiva de SKILL.md desde el filesystem
 * Parsea YAML frontmatter y extrae instrucciones
 * Solo carga skills cuando son seleccionados (lazy loading)
 * Fase 9: Skills System / Fase 2
 */

import { SkillStore } from '../storage/skill.store.js';
import { Skill, SkillMetadata } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';

export interface ParsedSkill {
  metadata: SkillMetadata;
  instructions: string;  // Body sin frontmatter
  fullContent: string;   // Contenido completo para inyectar
  estimatedTokens: number;  // Estimación para saber si cabe en context
}

export class SkillLoader {
  private skillStore: SkillStore;

  constructor(skillStore: SkillStore) {
    this.skillStore = skillStore;
  }

  /**
   * Cargar un skill y parsearlo
   */
  async loadSkill(userId: string, skillName: string): Promise<ParsedSkill | null> {
    try {
      // Leer del filesystem
      const skill = await this.skillStore.readSkill(userId, skillName);
      if (!skill) {
        return null;
      }

      // Parsear frontmatter y extraer instrucciones
      const { metadata, instructions } = this.parseSkillContent(skill.content);

      // Estimar tokens (aproximación: 1 token ≈ 4 caracteres)
      const estimatedTokens = Math.ceil(skill.content.length / 4);

      // Registrar uso del skill
      this.skillStore.recordSkillUsage(userId, skillName);

      logger.debug('Skill loaded', {
        userId,
        skillName,
        estimatedTokens,
      });

      return {
        metadata,
        instructions,
        fullContent: skill.content,
        estimatedTokens,
      };
    } catch (error) {
      logger.error('Failed to load skill', error);
      return null;
    }
  }

  /**
   * Cargar múltiples skills en paralelo
   */
  async loadSkills(userId: string, skillNames: string[]): Promise<ParsedSkill[]> {
    try {
      const loadPromises = skillNames.map(name => this.loadSkill(userId, name));
      const results = await Promise.all(loadPromises);

      // Filtrar nulls
      return results.filter(r => r !== null) as ParsedSkill[];
    } catch (error) {
      logger.error('Failed to load skills', error);
      return [];
    }
  }

  /**
   * Parsear SKILL.md: separar frontmatter de instrucciones
   * Retorna tanto metadata como body
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
          metadata: {} as SkillMetadata,
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
   * Soporta estructura básica compatible con SkillStore
   * Convierte guiones a camelCase: required-env → requiredEnv
   */
  private parseYAMLFrontmatter(yaml: string): SkillMetadata {
    const lines = yaml.split('\n');
    const metadata: any = {
      keywords: [],
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
        if (!Array.isArray(metadata[cleanKey])) {
          metadata[cleanKey] = [];
        }
      }
    }

    return metadata as SkillMetadata;
  }

  /**
   * Validar estructura de skill
   * Retorna array de errores (vacío si válido)
   */
  validateSkill(content: string): string[] {
    const errors: string[] = [];

    // Verificar frontmatter
    if (!content.startsWith('---\n')) {
      errors.push('Skill must start with YAML frontmatter (---)');
    }

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      errors.push('Invalid YAML frontmatter format');
      return errors;
    }

    const yaml = frontmatterMatch[1];

    // Validar campos requeridos
    if (!yaml.includes('name:')) {
      errors.push('Missing required field: name');
    }
    if (!yaml.includes('description:')) {
      errors.push('Missing required field: description');
    }

    // Validar nombre (lowercase, hyphens only)
    const nameMatch = yaml.match(/^name:\s*([^\n]+)/m);
    if (nameMatch) {
      const name = nameMatch[1].trim();
      if (!/^[a-z0-9-]+$/.test(name)) {
        errors.push('Skill name must be lowercase alphabet, numbers, and hyphens only');
      }
      if (name.length > 64) {
        errors.push('Skill name must be <= 64 characters');
      }
    }

    // Verificar que hay contenido después del frontmatter
    const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n\n([\s\S]+)$/);
    if (!bodyMatch || !bodyMatch[1].trim()) {
      errors.push('Skill must have content after frontmatter');
    }

    return errors;
  }

  /**
   * Estimar tokens de un skill
   * Aproximación: 1 token ≈ 4 caracteres (para English/Spanish)
   */
  estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Obtener total de tokens de múltiples skills
   */
  getTotalTokens(parsedSkills: ParsedSkill[]): number {
    return parsedSkills.reduce((sum, skill) => sum + skill.estimatedTokens, 0);
  }

  /**
   * Seleccionar skills que quepan dentro de un límite de tokens
   */
  selectSkillsByTokenBudget(
    parsedSkills: ParsedSkill[],
    maxTokens: number
  ): ParsedSkill[] {
    const selected: ParsedSkill[] = [];
    let totalTokens = 0;

    for (const skill of parsedSkills.sort((a, b) => a.estimatedTokens - b.estimatedTokens)) {
      if (totalTokens + skill.estimatedTokens <= maxTokens) {
        selected.push(skill);
        totalTokens += skill.estimatedTokens;
      }
    }

    return selected;
  }
}
