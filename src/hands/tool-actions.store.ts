import { randomUUID } from 'node:crypto';
import { JSONStore } from '../storage/json-store.js';
import { logger } from '../utils/logger.js';

export type ToolAction =
  | 'read_file'
  | 'write_file'
  | 'list_directory'
  | 'execute_command'
  | 'web_search';

export type ToolActionStatus = 'pending' | 'approved' | 'rejected' | 'executed';

export interface ToolActionRequest {
  id: string;
  userId: string;
  action: ToolAction;
  targetResource: string;
  description: string;
  parameters?: Record<string, any>;
  status: ToolActionStatus;
  createdAt: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  executedAt?: Date;
  result?: string;
}

/**
 * ToolActionsStore - Almacena solicitudes de herramientas pendientes
 *
 * Responsabilidades:
 * - Crear solicitudes pendientes de confirmación
 * - Aprobar/rechazar solicitudes
 * - Marcar solicitudes como ejecutadas
 * - Garantizar que solo hay UNA solicitud pending a la vez por usuario
 */
export class ToolActionsStore {
  private readonly store: JSONStore;
  private readonly PENDING_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos

  constructor(store: JSONStore) {
    this.store = store;
    logger.info('ToolActionsStore initialized');
  }

  /**
   * Crea una nueva solicitud de herramienta
   * Retorna solicitud pendiente existente si la hay (vigente)
   */
  createRequest(
    userId: string,
    action: ToolAction,
    targetResource: string,
    description: string,
    parameters?: Record<string, any>
  ): ToolActionRequest {
    // Limpiar solicitudes antiguas (> 10 minutos)
    this.cleanupOldPendingRequests(userId);

    // Verificar que no haya una solicitud pendiente vigente
    const pendingRequest = this.getPendingRequest(userId);
    if (pendingRequest) {
      // En lugar de error, retornar la solicitud pendiente existente
      logger.warn('Pending tool action already exists, returning existing request', {
        userId,
        requestId: pendingRequest.id,
        action: pendingRequest.action
      });
      return pendingRequest;
    }

    const request: ToolActionRequest = {
      id: randomUUID(),
      userId,
      action,
      targetResource,
      description,
      parameters,
      status: 'pending',
      createdAt: new Date(),
    };

    // Obtener requests actuales
    const data = this.store.read();
    const requests = (data.toolActions || []) as ToolActionRequest[];

    // Agregar nueva request
    requests.push(request);

    // Guardar
    this.store.write({ ...data, toolActions: requests });

    logger.info('Tool action request created', {
      userId,
      requestId: request.id,
      action,
      targetResource,
    });

    return request;
  }

  /**
   * Obtiene la solicitud pendiente de un usuario (si existe)
   */
  getPendingRequest(userId: string): ToolActionRequest | null {
    const data = this.store.read();
    const requests = (data.toolActions || []) as ToolActionRequest[];

    return (
      requests.find(
        (r) => r.userId === userId && r.status === 'pending'
      ) || null
    );
  }

  /**
   * Obtiene una solicitud por ID
   */
  getRequest(requestId: string): ToolActionRequest | null {
    const data = this.store.read();
    const requests = (data.toolActions || []) as ToolActionRequest[];

    return requests.find((r) => r.id === requestId) || null;
  }

  /**
   * Aprueba una solicitud
   * @throws Error si la solicitud no existe o no está pending
   */
  approveRequest(userId: string, requestId: string): void {
    const data = this.store.read();
    const requests = (data.toolActions || []) as ToolActionRequest[];

    const request = requests.find((r) => r.id === requestId);

    if (!request) {
      throw new Error('Solicitud no encontrada.');
    }

    if (request.userId !== userId) {
      throw new Error('No tienes permiso para aprobar esta solicitud.');
    }

    if (request.status !== 'pending') {
      throw new Error('La solicitud ya fue procesada.');
    }

    request.status = 'approved';
    request.approvedAt = new Date();

    this.store.write({ ...data, toolActions: requests });

    logger.info('Tool action request approved', {
      userId,
      requestId,
      action: request.action,
    });
  }

  /**
   * Rechaza una solicitud
   * @throws Error si la solicitud no existe o no está pending
   */
  rejectRequest(userId: string, requestId: string): void {
    const data = this.store.read();
    const requests = (data.toolActions || []) as ToolActionRequest[];

    const request = requests.find((r) => r.id === requestId);

    if (!request) {
      throw new Error('Solicitud no encontrada.');
    }

    if (request.userId !== userId) {
      throw new Error('No tienes permiso para rechazar esta solicitud.');
    }

    if (request.status !== 'pending') {
      throw new Error('La solicitud ya fue procesada.');
    }

    request.status = 'rejected';
    request.rejectedAt = new Date();

    this.store.write({ ...data, toolActions: requests });

    logger.info('Tool action request rejected', {
      userId,
      requestId,
      action: request.action,
    });
  }

  /**
   * Marca una solicitud como ejecutada
   * @throws Error si la solicitud no existe o no está approved
   */
  markExecuted(userId: string, requestId: string, result: string): void {
    const data = this.store.read();
    const requests = (data.toolActions || []) as ToolActionRequest[];

    const request = requests.find((r) => r.id === requestId);

    if (!request) {
      throw new Error('Solicitud no encontrada.');
    }

    if (request.userId !== userId) {
      throw new Error('No tienes permiso para modificar esta solicitud.');
    }

    if (request.status !== 'approved') {
      throw new Error('La solicitud debe estar aprobada antes de ejecutarse.');
    }

    request.status = 'executed';
    request.executedAt = new Date();
    request.result = result;

    this.store.write({ ...data, toolActions: requests });

    logger.info('Tool action request marked as executed', {
      userId,
      requestId,
      action: request.action,
    });
  }

  /**
   * Limpia solicitudes pending antiguas (> 10 minutos) para un usuario específico
   */
  private cleanupOldPendingRequests(userId: string): void {
    const data = this.store.read();
    const requests = (data.toolActions || []) as ToolActionRequest[];

    const tenMinutesAgo = new Date(Date.now() - this.PENDING_TIMEOUT_MS);

    const filtered = requests.filter((r) => {
      // Mantener solicitudes no-pending o requests recientes
      if (r.userId !== userId) return true;
      if (r.status !== 'pending') return true;

      const createdAt = new Date(r.createdAt);
      const isOld = createdAt < tenMinutesAgo;

      if (isOld) {
        logger.warn('Cleaned up old pending tool action request', {
          userId,
          requestId: r.id,
          action: r.action,
          createdAt: createdAt.toISOString()
        });
      }

      return !isOld;
    });

    if (filtered.length < requests.length) {
      this.store.write({ ...data, toolActions: filtered });
    }
  }

  /**
   * Limpia solicitudes antiguas (>7 días) de todos los usuarios
   */
  cleanupOldRequests(): number {
    const data = this.store.read();
    const requests = (data.toolActions || []) as ToolActionRequest[];

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const filtered = requests.filter((r) => {
      const createdAt = new Date(r.createdAt);
      return createdAt > sevenDaysAgo;
    });

    const removed = requests.length - filtered.length;

    if (removed > 0) {
      this.store.write({ ...data, toolActions: filtered });
      logger.info('Cleaned up old tool action requests', { removed });
    }

    return removed;
  }
}
