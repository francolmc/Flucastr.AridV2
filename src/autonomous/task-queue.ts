import { randomUUID } from 'crypto';

export type TaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type TaskType = 'skill_execution' | 'data_processing' | 'research' | 'monitoring' | 'custom';
export type TaskPriority = 'immediate' | 'high' | 'normal' | 'low';

export interface TaskSubtask {
  id: string;
  order: number;
  description: string;
  status: TaskStatus;
  completedAt?: Date;
  result?: string;
}

export interface TaskDefinition {
  id: string;
  userId: string;
  type: TaskType;
  skillName: string;
  title: string;
  description: string;
  params: Record<string, any>;
  priority: TaskPriority;
  status: TaskStatus;
  subtasks: TaskSubtask[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  result?: string;
  estimatedDurationMs?: number;
  actualDurationMs?: number;
  metadata?: Record<string, any>;
}

export interface TaskRuntime {
  id: string;
  userId: string;
  type: TaskType;
  skillName: string;
  title: string;
  description: string;
  params: Record<string, any>;
  priority: TaskPriority;
  status: TaskStatus;
  subtasks: TaskSubtask[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  error?: string;
  result?: string;
  estimatedDurationMs?: number;
  actualDurationMs?: number;
  metadata?: Record<string, any>;
}

export interface ProjectState {
  id: string;
  userId: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  taskIds: string[];
  completedTaskIds: string[];
  currentTaskIndex: number;
  checkpoints: ProjectCheckpoint[];
  metadata: Record<string, any>;
  createdAt: string;
  startedAt?: string;
  pausedAt?: string;
  completedAt?: string;
  estimatedCompletionTime?: string;
}

export interface ProjectCheckpoint {
  id: string;
  taskIndex: number;
  description: string;
  state: Record<string, any>;
  createdAt: string;
}

export class TaskQueue {
  static createTask(
    userId: string,
    type: TaskType,
    skillName: string,
    title: string,
    description: string,
    params: Record<string, any>,
    priority: TaskPriority = 'normal',
    subtasks: TaskSubtask[] = []
  ): TaskDefinition {
    return {
      id: randomUUID(),
      userId,
      type,
      skillName,
      title,
      description,
      params,
      priority,
      status: 'pending',
      subtasks,
      createdAt: new Date(),
    };
  }

  static createSubtask(
    order: number,
    description: string
  ): TaskSubtask {
    return {
      id: randomUUID(),
      order,
      description,
      status: 'pending',
    };
  }

  static toRuntime(task: TaskDefinition): TaskRuntime {
    return {
      ...task,
      createdAt: task.createdAt.toISOString(),
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
      failedAt: task.failedAt?.toISOString(),
    };
  }

  static fromRuntime(runtime: TaskRuntime): TaskDefinition {
    return {
      ...runtime,
      createdAt: new Date(runtime.createdAt),
      startedAt: runtime.startedAt ? new Date(runtime.startedAt) : undefined,
      completedAt: runtime.completedAt ? new Date(runtime.completedAt) : undefined,
      failedAt: runtime.failedAt ? new Date(runtime.failedAt) : undefined,
    };
  }

  static isCompleted(task: TaskDefinition): boolean {
    return task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled';
  }

  static getProgress(task: TaskDefinition): number {
    if (task.subtasks.length === 0) {
      return task.status === 'completed' ? 1 : task.status === 'running' ? 0.5 : 0;
    }

    const completed = task.subtasks.filter(s => s.status === 'completed').length;
    return completed / task.subtasks.length;
  }
}
