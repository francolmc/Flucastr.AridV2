import { Context } from 'telegraf';
import { logger } from '../utils/logger.js';
import { CredentialsStore } from '../storage/credentials.store.js';
import { ToolActionsStore, ToolActionRequest } from '../hands/tool-actions.store.js';

/**
 * Flujo de credenciales en progreso
 * Se almacena temporalmente mientras el usuario proporciona valores
 */
export interface CredentialsFlowState {
  id: string;
  userId: string;
  skillName: string;
  requiredVariables: string[];
  providedValues: Map<string, string>;
  currentVariableIndex: number;
  conversationId?: string;
  createdAt: Date;
  expiresAt: Date; // 10 minutos
}

/**
 * SkillCredentialsFlow - Flujo guiado de configuración de credenciales (Fase 10)
 *
 * Responsabilidades:
 * - Detectar cuando skill requiere credenciales no configuradas
 * - Iniciar conversación amigable: "Para usar GitHub necesito tu GITHUB_TOKEN"
 * - Solicitar cada credencial uno por uno
 * - Validar formato básico antes de guardar
 * - Pedir confirmación explícita: "¿Confirmas que quieres guardar esto?"
 * - Encriptar y almacenar en CredentialsStore
 * - Confirmar final: "Perfecto, ya tengo tu GitHub token guardado de forma segura"
 *
 * IMPORTANTE: La seguridad es prioridad
 * - Nunca mostrar credentials en logs
 * - Solicitar confirmación antes de guardar
 * - Encrypciónaen DB via CredentialsStore (AES-256-GCM)
 * - Timeout si usuario no responde en 10 minutos
 *
 * Flujo:
 * 1. User intenta usar skill con credenciales faltantes
 * 2. SkillCredentialsFlow.initializeFlow(skillName, requiredVars)
 * 3. Bot pide primer credential uno por uno
 * 4. User proporciona valores
 * 5. Bot confirma: "¿Mostrar credencial para confirmar?"
 * 6. User aprueba
 * 7. SkillCredentialsFlow.saveCredentials(flowId)
 * 8. Bot: "Guardado de forma segura"
 */
export class SkillCredentialsFlow {
  private readonly credStore: CredentialsStore;
  private readonly toolActionsStore: ToolActionsStore;
  private readonly FLOW_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos
  private readonly MAX_CREDENTIAL_LENGTH = 5000; // Limitar tamaño

  private activeFlows: Map<string, CredentialsFlowState> = new Map();

  constructor(credStore: CredentialsStore, toolActionsStore: ToolActionsStore) {
    this.credStore = credStore;
    this.toolActionsStore = toolActionsStore;

    // Limpiar flujos expirados cada minuto
    setInterval(() => this.cleanupExpiredFlows(), 60 * 1000);

    logger.info('SkillCredentialsFlow initialized');
  }

  /**
   * Inicia un flujo de solicitud de credenciales
   * Retorna flowId que se usa para rastrear el flujo
   */
  async initializeFlow(
    ctx: Context,
    userId: string,
    skillName: string,
    requiredVariables: string[]
  ): Promise<string> {
    const flowId = this.generateFlowId();

    const flow: CredentialsFlowState = {
      id: flowId,
      userId,
      skillName,
      requiredVariables,
      providedValues: new Map(),
      currentVariableIndex: 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.FLOW_TIMEOUT_MS),
    };

    this.activeFlows.set(flowId, flow);

    logger.info('Credentials flow initialized', {
      flowId,
      userId,
      skillName,
      requiredVars: requiredVariables.length,
    });

    // Solicitar primera credencial
    await this.requestNextCredential(ctx, flow);

    return flowId;
  }

  /**
   * Procesa respuesta del usuario en un flujo
   */
  async processCredentialResponse(ctx: Context, flowId: string, value: string): Promise<void> {
    const flow = this.activeFlows.get(flowId);

    if (!flow) {
      await ctx.reply('❌ Flujo de credenciales expirado. Para usar este skill, inicia el flujo nuevamente.');
      logger.warn('Attempted to process response for non-existent flow', { flowId });
      return;
    }

    // Guardar valor proporcionado (sin logear)
    const variableName = flow.requiredVariables[flow.currentVariableIndex];
    flow.providedValues.set(variableName, value);

    // Validar longitud (prevenir inyecciones)
    if (value.length > this.MAX_CREDENTIAL_LENGTH) {
      await ctx.reply(
        `❌ El valor proporcionado es muy largo (máximo ${this.MAX_CREDENTIAL_LENGTH} caracteres). ` +
          'Intenta nuevamente.'
      );
      return;
    }

    // Pedir confirmación antes de guardar
    const description = this.getCredentialDescription(variableName);

    const message =
      `✅ Recibí tu ${description}\n\n` +
      `¿Confirmas que quieres que guarde este valor de forma segura (encriptado)?`;

    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Sí, guardar', callback_data: `confirm_cred:${flowId}` },
            { text: '❌ No, de nuevo', callback_data: `reject_cred:${flowId}` },
          ],
        ],
      },
    });

    logger.debug('Credential confirmation requested', {
      flowId,
      variableName,
    });
  }

  /**
   * Confirma y guarda un credential
   */
  async confirmAndSaveCredential(ctx: Context, flowId: string): Promise<boolean> {
    const flow = this.activeFlows.get(flowId);

    if (!flow) {
      await ctx.reply('❌ Flujo expirado.');
      return false;
    }

    const variableName = flow.requiredVariables[flow.currentVariableIndex];
    const value = flow.providedValues.get(variableName);

    if (!value) {
      await ctx.reply('❌ Error: valor no encontrado.');
      return false;
    }

    try {
      // Guardar en CredentialsStore (encriptado)
      this.credStore.saveCredential(flow.userId, flow.skillName, variableName, value);

      const description = this.getCredentialDescription(variableName);

      await ctx.reply(`🔐 Perfecto, tu ${description} está guardado de forma segura (encriptado).`);

      logger.info('Credential saved successfully', {
        flowId,
        skillName: flow.skillName,
        variableName,
      });

      // Continuar con siguiente credencial
      flow.currentVariableIndex++;

      if (flow.currentVariableIndex < flow.requiredVariables.length) {
        // Hay más credenciales por solicitar
        await this.requestNextCredential(ctx, flow);
        return true;
      } else {
        // Todos los credenciales guardados
        await ctx.reply(
          `✅ ¡Listo! Ya tengo todos los credenciales necesarios para usar *${flow.skillName}*. ` +
            `Ahora puedo ayudarte con todo lo que necesites.`,
          { parse_mode: 'Markdown' }
        );

        this.activeFlows.delete(flowId);
        return true;
      }
    } catch (error) {
      logger.error('Failed to save credential', {
        flowId,
        skillName: flow.skillName,
        error,
      });

      await ctx.reply('❌ Error al guardar el credencial. Por favor, intenta nuevamente.');
      return false;
    }
  }

  /**
   * Rechaza un credential (solicita de nuevo)
   */
  async rejectCredential(ctx: Context, flowId: string): Promise<void> {
    const flow = this.activeFlows.get(flowId);

    if (!flow) {
      await ctx.reply('❌ Flujo expirado.');
      return;
    }

    flow.providedValues.delete(flow.requiredVariables[flow.currentVariableIndex]);

    await ctx.reply('Entendido. Proporciona el valor nuevamente, por favor.');

    await this.requestNextCredential(ctx, flow);
  }

  /**
   * Solicita el siguiente credential del flujo
   */
  private async requestNextCredential(ctx: Context, flow: CredentialsFlowState): Promise<void> {
    if (flow.currentVariableIndex >= flow.requiredVariables.length) {
      return;
    }

    const variableName = flow.requiredVariables[flow.currentVariableIndex];
    const description = this.getCredentialDescription(variableName);
    const progress = `(${flow.currentVariableIndex + 1}/${flow.requiredVariables.length})`;

    const message = `🔐 Para usar el skill *${flow.skillName}*, necesito tu ${description} ${progress}\n\n` +
      `Por favor proporciona el valor (será encriptado y almacenado de forma segura).`;

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
      },
    });

    logger.debug('Requesting credential', {
      flowId: flow.id,
      variableName,
      progress,
    });
  }

  /**
   * Obtiene descripción amigable de una variable de credencial
   * Mapeo de ejemplo: traduce nombres técnicos a descripciones en español
   * Si la variable no está en el mapeo, genera una descripción genérica
   */
  private getCredentialDescription(variableName: string): string {
    // Mapeo de ejemplo de credenciales comunes
    // Puede extenderse según nuevas credenciales que se agreguen
    const descriptions: { [key: string]: string } = {
      GITHUB_TOKEN: 'token de GitHub',
      GITHUB_USERNAME: 'usuario de GitHub',
      GITLAB_TOKEN: 'token de GitLab',
      OPENAI_API_KEY: 'clave de API de OpenAI',
      ANTHROPIC_API_KEY: 'clave de API de Anthropic',
      SLACK_BOT_TOKEN: 'token del bot de Slack',
      TELEGRAM_BOT_TOKEN: 'token del bot de Telegram',
      DISCORD_BOT_TOKEN: 'token del bot de Discord',
      AWS_ACCESS_KEY_ID: 'clave de acceso de AWS',
      AWS_SECRET_ACCESS_KEY: 'clave secreta de AWS',
      API_KEY: 'clave de API',
      API_TOKEN: 'token de API',
      DATABASE_URL: 'URL de base de datos',
      SSH_KEY: 'clave SSH',
      EMAIL_PASSWORD: 'contraseña de email',
    };

    return descriptions[variableName] || `credencial ${variableName}`;
  }

  /**
   * Crea un flujo de solicitud de aprobación para credenciales
   * Alternativa: si el usuario prefiere proporcionar de una vez
   */
  async requestCredentialsViaApproval(
    userId: string,
    skillName: string,
    requiredVariables: string[]
  ): Promise<ToolActionRequest> {
    const varList = requiredVariables.map((v) => `• ${this.getCredentialDescription(v)}`).join('\n');

    const request = this.toolActionsStore.createRequest(
      userId,
      'save_credentials',
      skillName,
      `Se requieren credenciales para usar el skill "${skillName}":\n\n${varList}`,
      {
        skillName,
        requiredVariables,
      }
    );

    logger.info('Credentials approval requested', {
      userId,
      skillName,
      requiredCount: requiredVariables.length,
    });

    return request;
  }

  /**
   * Verifica si un skill tiene todas las credenciales requeridas
   */
  hasAllCredentials(userId: string, skillName: string, requiredVariables: string[]): boolean {
    try {
      const credentials = this.credStore.getCredentials(userId, skillName);

      for (const varName of requiredVariables) {
        if (!credentials[varName]) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Failed to check credentials', {
        userId,
        skillName,
        error,
      });

      return false;
    }
  }

  /**
   * Limpia flujos expirados
   */
  private cleanupExpiredFlows(): void {
    const now = new Date();
    let expiredCount = 0;

    for (const [flowId, flow] of this.activeFlows.entries()) {
      if (flow.expiresAt < now) {
        this.activeFlows.delete(flowId);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      logger.info('Cleaned up expired credentials flows', { expiredCount });
    }
  }

  /**
   * Genera un ID único para el flujo
   */
  private generateFlowId(): string {
    return `flow_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
