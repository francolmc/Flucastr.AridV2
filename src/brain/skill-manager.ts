import { logger } from '../utils/logger.js';
import { SkillStore } from '../storage/skill.store.js';
import { CredentialsStore } from '../storage/credentials.store.js';
import { SkillMatcher } from './skill-matcher.js';
import { SkillLoader, ParsedSkill } from './skill-loader.js';
import { SkillTemplateGenerator } from './skill-template-generator.js';
import { ToolActionsStore, ToolActionRequest } from '../hands/tool-actions.store.js';
import { ConversationMessage } from '../config/types.js';

/**
 * Operación detectada sobre skills
 */
export type SkillOperation = 'create' | 'edit' | 'delete' | 'list' | 'get' | 'none';

/**
 * Resultado del análisis de intención de skill
 */
export interface SkillOperationDetection {
  operation: SkillOperation;
  skillName?: string;
  description?: string;
  keywords?: string[];
  confidence: number;
}

/**
 * Patrón detectado para sugerir creación de skill
 */
export interface SkillCreationSuggestion {
  pattern: string;
  frequency: number;
  suggestedSkillName: string;
  suggestedDescription: string;
  keywords: string[];
}

/**
 * SkillManager - Gestor conversacional de skills (Fase 9)
 *
 * Responsabilidades:
 * - Detectar intenciones del usuario sobre skills (crear, editar, eliminar, listar)
 * - Sugerir creación de skills basado en patrones repetitivos
 * - Manejar flujos conversacionales para solicitar credenciales
 * - Integrar con ToolActionsStore para aprobación del usuario
 * - Generar SKILL.md basado en conversación del usuario
 *
 * IMPORTANTE: TODAS las operaciones de escritura/ejecución requieren aprobación explícita
 * El usuario debe siempre tener control total sobre qué skills se crean/modifican
 */
export class SkillManager {
  private readonly skillStore: SkillStore;
  private readonly credStore: CredentialsStore;
  private readonly skillMatcher: SkillMatcher;
  private readonly skillLoader: SkillLoader;
  private readonly templateGenerator: SkillTemplateGenerator;
  private readonly toolActionsStore: ToolActionsStore;

  constructor(
    skillStore: SkillStore,
    credStore: CredentialsStore,
    skillMatcher: SkillMatcher,
    skillLoader: SkillLoader,
    toolActionsStore: ToolActionsStore
  ) {
    this.skillStore = skillStore;
    this.credStore = credStore;
    this.skillMatcher = skillMatcher;
    this.skillLoader = skillLoader;
    this.templateGenerator = new SkillTemplateGenerator();
    this.toolActionsStore = toolActionsStore;

    logger.info('SkillManager initialized');
  }

  /**
   * Detecta intención del usuario sobre skills
   * Analiza si pregunta por skill, intenta crear uno, etc
   *
   * Patrones detectados:
   * - "crear skill para..." → create
   * - "quiero un skill que..." → create
   * - "editar [skillName]" → edit
   * - "borrar [skillName]" → delete
   * - "listar skills" / "qué skills tengo" → list
   * - "usar [skillName]" / "activar [skillName]" → get
   */
  async detectSkillOperation(message: string, userId: string): Promise<SkillOperationDetection> {
    const lowerMsg = message.toLowerCase();

    // Detectar intención de creación
    if (
      lowerMsg.includes('crear skill') ||
      lowerMsg.includes('quiero un skill') ||
      lowerMsg.includes('nuevo skill') ||
      lowerMsg.includes('puedes hacer un skill')
    ) {
      // Extraer nombre y descripción si está disponible
      const descMatch = message.match(/(?:para|que)\s+(.+?)(?:\.|,|$)/i);
      const description = descMatch ? descMatch[1].trim() : undefined;

      return {
        operation: 'create',
        description,
        confidence: 0.95,
      };
    }

    // Detectar intención de edición
    if (lowerMsg.includes('editar') && lowerMsg.includes('skill')) {
      const skillMatch = message.match(/editar\s+(?:el\s+)?skill\s+["\']?(\w+)/i);
      const skillName = skillMatch ? skillMatch[1] : undefined;

      return {
        operation: 'edit',
        skillName,
        confidence: 0.9,
      };
    }

    // Detectar intención de eliminación
    if (lowerMsg.includes('borrar') || lowerMsg.includes('eliminar') || lowerMsg.includes('remover')) {
      if (lowerMsg.includes('skill')) {
        const skillMatch = message.match(/(?:borrar|eliminar|remover)\s+(?:el\s+)?skill\s+["\']?(\w+)/i);
        const skillName = skillMatch ? skillMatch[1] : undefined;

        return {
          operation: 'delete',
          skillName,
          confidence: 0.9,
        };
      }
    }

    // Detectar intención de listado
    if (
      lowerMsg.includes('listar skill') ||
      lowerMsg.includes('qué skill') ||
      lowerMsg.includes('cuáles skills') ||
      lowerMsg.includes('mis skills')
    ) {
      return {
        operation: 'list',
        confidence: 0.95,
      };
    }

    // Detectar intención de obtener/usar skill
    if (lowerMsg.includes('usar') || lowerMsg.includes('activar')) {
      if (lowerMsg.includes('skill')) {
        const skillMatch = message.match(/(?:usar|activar)\s+(?:el\s+)?skill\s+["\']?(\w+)/i);
        const skillName = skillMatch ? skillMatch[1] : undefined;

        return {
          operation: 'get',
          skillName,
          confidence: 0.85,
        };
      }
    }

    return {
      operation: 'none',
      confidence: 0,
    };
  }

  /**
   * Sugiere la creación de un skill basado en patrones repetitivos
   * Busca en el historial de conversación mensajes similares (2-3 veces)
   *
   * Ejemplo:
   * - Si usuario pregunta sobre "GitHub repos" 3 veces → sugerir skill
   * - Si mencionan "API key" + "comando" múltiples veces → sugerir skill
   */
  async suggestSkillCreation(
    userId: string,
    recentMessages: ConversationMessage[]
  ): Promise<SkillCreationSuggestion | null> {
    if (recentMessages.length < 2) {
      return null;
    }

    // Analizar patrones comunes en los últimos 10 mensajes
    const userMessages = recentMessages
      .filter((m) => m.role === 'user')
      .slice(-10)
      .map((m) => m.content);

    // Buscar keywords repetidas
    // NOTA: Este enfoque es un ejemplo básico. Idealmente, los patrones deberían
    // extraerse dinámicamente de los skills disponibles o de análisis de uso
    const keywordCounts: Map<string, number> = new Map();
    
    // Patrones de ejemplo (deberían ser configurables, no hardcodeados)
    /*
    const commonPatterns = [
      { keyword: 'github', suggestedName: 'github-manager', description: 'Gestión de repositorios GitHub' },
      { keyword: 'docker', suggestedName: 'docker-controller', description: 'Control de contenedores Docker' },
      { keyword: 'api', suggestedName: 'api-client', description: 'Cliente genérico para APIs REST' },
      { keyword: 'curl', suggestedName: 'curl-wrapper', description: 'Wrapper para peticiones HTTP' },
      { keyword: 'python', suggestedName: 'python-runner', description: 'Ejecutor de scripts Python' },
      { keyword: 'bash', suggestedName: 'bash-executor', description: 'Ejecutor de scripts Bash' },
    ];
    */

    // Por ahora, deshabilitado: los skills se detectan dinámicamente mediante SkillMatcher
    return null;
  }

  /**
   * Genera template de skill basado en descripción del usuario
   * Integrado con LLM para extraer estructura
   */
  async generateSkillTemplate(
    description: string,
    userId: string,
    conversationContext?: string
  ): Promise<{
    skillName: string;
    frontmatter: string;
    instructions: string;
    suggestedCredentials: string[];
  }> {
    logger.info('Generating skill template', {
      userId,
      descriptionLength: description.length,
    });

    return this.templateGenerator.generateFromDescription(description, conversationContext);
  }

  /**
   * Crea solicitud de aprobación para crear un nuevo skill
   * Retorna requestId para que el usuario pueda aprobar/rechazar
   */
  requestSkillCreation(
    userId: string,
    skillName: string,
    description: string,
    keywords: string[],
    instructions: string,
    suggestedCredentials?: string[]
  ): ToolActionRequest {
    const request = this.toolActionsStore.createRequest(
      userId,
      'create_skill',
      skillName,
      `Crear nuevo skill: "${skillName}" - ${description}${
        suggestedCredentials && suggestedCredentials.length > 0
          ? `\nCredenciales requeridas: ${suggestedCredentials.join(', ')}`
          : ''
      }`,
      {
        skillName,
        description,
        keywords,
        instructions,
        suggestedCredentials,
      }
    );

    logger.info('Skill creation approval requested', {
      userId,
      skillName,
      requestId: request.id,
    });

    return request;
  }

  /**
   * Crea solicitud de aprobación para editar un skill existente
   */
  requestSkillEdit(
    userId: string,
    skillName: string,
    changes: string
  ): ToolActionRequest {
    const request = this.toolActionsStore.createRequest(
      userId,
      'edit_skill',
      skillName,
      `Editar skill: "${skillName}"\n\nCambios propuestos:\n${changes}`,
      {
        skillName,
        changes,
      }
    );

    logger.info('Skill edit approval requested', {
      userId,
      skillName,
      requestId: request.id,
    });

    return request;
  }

  /**
   * Crea solicitud de aprobación para eliminar un skill
   */
  requestSkillDeletion(userId: string, skillName: string): ToolActionRequest {
    const request = this.toolActionsStore.createRequest(
      userId,
      'delete_skill',
      skillName,
      `¿Eliminar skill "${skillName}"? Esta acción no se puede deshacer.`,
      {
        skillName,
      }
    );

    logger.info('Skill deletion approval requested', {
      userId,
      skillName,
      requestId: request.id,
    });

    return request;
  }

  /**
   * Maneja flujo conversacional para solicitar credenciales
   * El usuario debe proporcionar el valor (nunca se debe asumir)
   */
  async requestCredentials(
    userId: string,
    skillName: string,
    requiredVariables: string[]
  ): Promise<{
    variables: Map<string, string>;
    allProvided: boolean;
  }> {
    logger.info('Requesting credentials for skill', {
      userId,
      skillName,
      requiredVariables,
    });

    // PLACEHOLDER: En una conversación real, esto sería un flujo interactivo
    // Por ahora retornamos un mapa vacío indicando que se necesitan credenciales
    const variables = new Map<string, string>();

    return {
      variables,
      allProvided: false,
    };
  }

  /**
   * Almacena credenciales para un skill
   * Require aprobación previa via ToolActionsStore
   */
  async saveSkillCredentials(
    userId: string,
    skillName: string,
    requestId: string,
    credentials: Map<string, string>
  ): Promise<void> {
    // Verificar que la solicitud fue aprobada
    const request = this.toolActionsStore.getRequest(requestId);
    if (!request || request.status !== 'approved') {
      throw new Error('Credenciales no aprobadas por el usuario');
    }

    try {
      for (const [key, value] of credentials.entries()) {
        this.credStore.saveCredential(userId, skillName, key, value);
      }

      logger.info('Skill credentials saved', {
        userId,
        skillName,
        credentialCount: credentials.size,
      });

      // Marcar como ejecutada
      this.toolActionsStore.markExecuted(userId, requestId, 'Credenciales guardadas exitosamente');
    } catch (error) {
      logger.error('Failed to save skill credentials', { userId, skillName, error });
      throw error;
    }
  }

  /**
   * Ejecuta la creación de un skill (después de aprobación)
   */
  async executeSkillCreation(
    userId: string,
    requestId: string,
    skillName: string,
    description: string,
    keywords: string[],
    instructions: string,
    requiredEnv?: string[]
  ): Promise<void> {
    // Verificar que la solicitud fue aprobada
    const request = this.toolActionsStore.getRequest(requestId);
    if (!request || request.status !== 'approved') {
      throw new Error('Creación de skill no aprobada por el usuario');
    }

    try {
      await this.skillStore.createSkill(userId, skillName, description, instructions, requiredEnv);

      logger.info('Skill created successfully', { userId, skillName });

      // Marcar como ejecutada
      this.toolActionsStore.markExecuted(userId, requestId, `Skill "${skillName}" creado exitosamente`);
    } catch (error) {
      logger.error('Failed to create skill', { userId, skillName, error });
      throw error;
    }
  }

  /**
   * Ejecuta la eliminación de un skill (después de aprobación)
   */
  async executeSkillDeletion(userId: string, requestId: string, skillName: string): Promise<void> {
    // Verificar que la solicitud fue aprobada
    const request = this.toolActionsStore.getRequest(requestId);
    if (!request || request.status !== 'approved') {
      throw new Error('Eliminación de skill no aprobada por el usuario');
    }

    try {
      this.skillStore.deleteSkill(userId, skillName);

      // También eliminar credenciales asociadas
      this.credStore.deleteSkillCredentials(userId, skillName);

      logger.info('Skill deleted successfully', { userId, skillName });

      // Marcar como ejecutada
      this.toolActionsStore.markExecuted(userId, requestId, `Skill "${skillName}" eliminado exitosamente`);
    } catch (error) {
      logger.error('Failed to delete skill', { userId, skillName, error });
      throw error;
    }
  }

  /**
   * Lista los skills del usuario
   * (No requiere aprobación, es solo lectura)
   */
  async listUserSkills(userId: string): Promise<Array<{ name: string; description: string }>> {
    try {
      const skills = this.skillStore.listSkills(userId);

      return skills.map((metadata) => ({
        name: metadata.name,
        description: metadata.description,
      }));
    } catch (error) {
      logger.error('Failed to list skills', { userId, error });
      return [];
    }
  }

  /**
   * Obtiene información detallada de un skill
   */
  async getSkillInfo(userId: string, skillName: string): Promise<ParsedSkill | null> {
    try {
      const parsed = await this.skillLoader.loadSkill(userId, skillName);
      return parsed;
    } catch (error) {
      logger.error('Failed to get skill info', { userId, skillName, error });
      return null;
    }
  }
}
