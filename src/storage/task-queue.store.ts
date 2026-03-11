import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';
import { JSONStore } from './json-store.js';
import { TaskDefinition, TaskRuntime, TaskStatus, TaskQueue } from '../autonomous/task-queue.js';

export class TaskQueueStore {
  constructor(private jsonStore: JSONStore) {}

  createTask(
    userId: string,
    type: any,
    skillName: string,
    title: string,
    description: string,
    params: Record<string, any>,
    priority: any = 'normal'
  ): TaskDefinition {
    try {
      const task = TaskQueue.createTask(userId, type, skillName, title, description, params, priority);
      this.saveTask(task);

      logger.debug('Task created', {
        userId,
        taskId: task.id,
        skillName,
        title,
      });

      return task;
    } catch (error) {
      logger.error('Failed to create task', { userId, skillName, error });
      throw new StorageError(`Failed to create task: ${error}`);
    }
  }

  private saveTask(task: TaskDefinition): void {
    try {
      const data = this.jsonStore.read();
      if (!data.tasks) {
        data.tasks = {};
      }
      if (!data.tasks[task.userId]) {
        data.tasks[task.userId] = [];
      }

      const taskRuntime = TaskQueue.toRuntime(task);
      data.tasks[task.userId].push(taskRuntime);

      this.jsonStore.write(data);
    } catch (error) {
      logger.error('Failed to save task', error);
      throw error;
    }
  }

  getTask(userId: string, taskId: string): TaskDefinition | null {
    try {
      const data = this.jsonStore.read();
      const userTasks = data.tasks?.[userId] || [];
      const taskRuntime = userTasks.find((t: TaskRuntime) => t.id === taskId);

      if (!taskRuntime) {
        return null;
      }

      return TaskQueue.fromRuntime(taskRuntime);
    } catch (error) {
      logger.error('Failed to get task', { userId, taskId, error });
      return null;
    }
  }

  updateTask(userId: string, taskId: string, updates: Partial<TaskDefinition>): TaskDefinition | null {
    try {
      const data = this.jsonStore.read();
      if (!data.tasks?.[userId]) {
        return null;
      }

      const userTasks = data.tasks[userId];
      const index = userTasks.findIndex((t: TaskRuntime) => t.id === taskId);

      if (index === -1) {
        return null;
      }

      const current = TaskQueue.fromRuntime(userTasks[index]);
      const updated: TaskDefinition = {
        ...current,
        ...updates,
      };

      userTasks[index] = TaskQueue.toRuntime(updated);
      this.jsonStore.write(data);

      logger.debug('Task updated', {
        userId,
        taskId,
        status: updated.status,
      });

      return updated;
    } catch (error) {
      logger.error('Failed to update task', { userId, taskId, error });
      return null;
    }
  }

  listTasksByUser(userId: string): TaskDefinition[] {
    try {
      const data = this.jsonStore.read();
      const userTasks = data.tasks?.[userId] || [];

      return userTasks.map((t: TaskRuntime) => TaskQueue.fromRuntime(t));
    } catch (error) {
      logger.error('Failed to list tasks', { userId, error });
      return [];
    }
  }

  listByStatus(userId: string, status: TaskStatus): TaskDefinition[] {
    try {
      return this.listTasksByUser(userId).filter(t => t.status === status);
    } catch (error) {
      logger.error('Failed to list tasks by status', { userId, status, error });
      return [];
    }
  }

  getNextPendingTask(): TaskDefinition | null {
    try {
      const data = this.jsonStore.read();
      if (!data.tasks) {
        return null;
      }

      for (const userId in data.tasks) {
        const userTasks = data.tasks[userId];
        const pending = userTasks.find((t: TaskRuntime) => t.status === 'pending');

        if (pending) {
          return TaskQueue.fromRuntime(pending);
        }
      }

      return null;
    } catch (error) {
      logger.error('Failed to get next pending task', { error });
      return null;
    }
  }

  deleteTask(userId: string, taskId: string): boolean {
    try {
      const data = this.jsonStore.read();
      if (!data.tasks?.[userId]) {
        return false;
      }

      const userTasks = data.tasks[userId];
      const index = userTasks.findIndex((t: TaskRuntime) => t.id === taskId);

      if (index === -1) {
        return false;
      }

      userTasks.splice(index, 1);
      this.jsonStore.write(data);

      logger.debug('Task deleted', { userId, taskId });

      return true;
    } catch (error) {
      logger.error('Failed to delete task', { userId, taskId, error });
      return false;
    }
  }

  countTasksByStatus(userId: string): Record<TaskStatus, number> {
    try {
      const tasks = this.listTasksByUser(userId);
      const counts: Record<TaskStatus, number> = {
        pending: 0,
        running: 0,
        paused: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      };

      for (const task of tasks) {
        counts[task.status]++;
      }

      return counts;
    } catch (error) {
      logger.error('Failed to count tasks', { userId, error });
      return {
        pending: 0,
        running: 0,
        paused: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      };
    }
  }
}
