import { logger } from '../utils/logger.js';
import { JSONStore } from '../storage/json-store.js';
import { ProjectState, ProjectCheckpoint } from './task-queue.js';
import { randomUUID } from 'crypto';

export class ProjectStateTracker {
  constructor(private jsonStore: JSONStore) {}

  createProject(
    userId: string,
    name: string,
    description: string,
    taskIds: string[]
  ): ProjectState {
    try {
      const project: ProjectState = {
        id: randomUUID(),
        userId,
        name,
        description,
        status: 'active',
        taskIds,
        completedTaskIds: [],
        currentTaskIndex: 0,
        checkpoints: [],
        metadata: {},
        createdAt: new Date().toISOString(),
      };

      this.saveProject(project);

      logger.info('Project created', {
        userId,
        projectId: project.id,
        name,
        taskCount: taskIds.length,
      });

      return project;
    } catch (error) {
      logger.error('Failed to create project', { userId, name, error });
      throw error;
    }
  }

  private saveProject(project: ProjectState): void {
    try {
      const data = this.jsonStore.read();
      if (!data.projects) {
        data.projects = {};
      }
      if (!data.projects[project.userId]) {
        data.projects[project.userId] = [];
      }

      data.projects[project.userId].push(project);
      this.jsonStore.write(data);
    } catch (error) {
      logger.error('Failed to save project', error);
      throw error;
    }
  }

  getProject(userId: string, projectId: string): ProjectState | null {
    try {
      const data = this.jsonStore.read();
      const userProjects = data.projects?.[userId] || [];
      return userProjects.find((p: ProjectState) => p.id === projectId) || null;
    } catch (error) {
      logger.error('Failed to get project', { userId, projectId, error });
      return null;
    }
  }

  listProjects(userId: string): ProjectState[] {
    try {
      const data = this.jsonStore.read();
      return data.projects?.[userId] || [];
    } catch (error) {
      logger.error('Failed to list projects', { userId, error });
      return [];
    }
  }

  updateProject(userId: string, projectId: string, updates: Partial<ProjectState>): ProjectState | null {
    try {
      const data = this.jsonStore.read();
      if (!data.projects?.[userId]) {
        return null;
      }

      const userProjects = data.projects[userId];
      const index = userProjects.findIndex((p: ProjectState) => p.id === projectId);

      if (index === -1) {
        return null;
      }

      const current = userProjects[index];
      const updated: ProjectState = {
        ...current,
        ...updates,
      };

      userProjects[index] = updated;
      this.jsonStore.write(data);

      logger.debug('Project updated', {
        userId,
        projectId,
        status: updated.status,
      });

      return updated;
    } catch (error) {
      logger.error('Failed to update project', { userId, projectId, error });
      return null;
    }
  }

  createCheckpoint(
    userId: string,
    projectId: string,
    description: string,
    state: Record<string, any>
  ): ProjectCheckpoint | null {
    try {
      const project = this.getProject(userId, projectId);
      if (!project) {
        return null;
      }

      const checkpoint: ProjectCheckpoint = {
        id: randomUUID(),
        taskIndex: project.currentTaskIndex,
        description,
        state,
        createdAt: new Date().toISOString(),
      };

      project.checkpoints.push(checkpoint);
      this.updateProject(userId, projectId, { checkpoints: project.checkpoints });

      logger.info('Checkpoint created', {
        userId,
        projectId,
        checkpointId: checkpoint.id,
        description,
      });

      return checkpoint;
    } catch (error) {
      logger.error('Failed to create checkpoint', {
        userId,
        projectId,
        error,
      });
      return null;
    }
  }

  restoreCheckpoint(
    userId: string,
    projectId: string,
    checkpointId: string
  ): ProjectState | null {
    try {
      const project = this.getProject(userId, projectId);
      if (!project) {
        return null;
      }

      const checkpoint = project.checkpoints.find((cp) => cp.id === checkpointId);
      if (!checkpoint) {
        return null;
      }

      const restored = this.updateProject(userId, projectId, {
        currentTaskIndex: checkpoint.taskIndex,
        metadata: {
          ...project.metadata,
          ...checkpoint.state,
          restoredFromCheckpoint: checkpointId,
          restoredAt: new Date().toISOString(),
        },
      });

      logger.info('Checkpoint restored', {
        userId,
        projectId,
        checkpointId,
        taskIndex: checkpoint.taskIndex,
      });

      return restored;
    } catch (error) {
      logger.error('Failed to restore checkpoint', {
        userId,
        projectId,
        checkpointId,
        error,
      });
      return null;
    }
  }

  pauseProject(userId: string, projectId: string): ProjectState | null {
    try {
      const project = this.getProject(userId, projectId);
      if (!project) {
        return null;
      }

      const updated = this.updateProject(userId, projectId, {
        status: 'paused',
        pausedAt: new Date().toISOString(),
      });

      logger.info('Project paused', { userId, projectId });

      return updated;
    } catch (error) {
      logger.error('Failed to pause project', { userId, projectId, error });
      return null;
    }
  }

  resumeProject(userId: string, projectId: string): ProjectState | null {
    try {
      const project = this.getProject(userId, projectId);
      if (!project) {
        return null;
      }

      const updated = this.updateProject(userId, projectId, {
        status: 'active',
        pausedAt: undefined,
      });

      logger.info('Project resumed', { userId, projectId });

      return updated;
    } catch (error) {
      logger.error('Failed to resume project', { userId, projectId, error });
      return null;
    }
  }

  completeTask(userId: string, projectId: string, taskId: string): ProjectState | null {
    try {
      const project = this.getProject(userId, projectId);
      if (!project) {
        return null;
      }

      if (!project.completedTaskIds.includes(taskId)) {
        project.completedTaskIds.push(taskId);
      }

      const updated = this.updateProject(userId, projectId, {
        completedTaskIds: project.completedTaskIds,
        currentTaskIndex: project.currentTaskIndex + 1,
      });

      // Si todas las tareas están completadas, marcar proyecto como completado
      if (updated && updated.completedTaskIds.length === updated.taskIds.length) {
        return this.updateProject(userId, projectId, {
          status: 'completed',
          completedAt: new Date().toISOString(),
        });
      }

      logger.debug('Task marked as completed in project', {
        userId,
        projectId,
        taskId,
        progress: `${project.completedTaskIds.length + 1}/${project.taskIds.length}`,
      });

      return updated;
    } catch (error) {
      logger.error('Failed to complete task in project', {
        userId,
        projectId,
        taskId,
        error,
      });
      return null;
    }
  }

  getProgress(userId: string, projectId: string): {
    completed: number;
    total: number;
    percentage: number;
  } | null {
    try {
      const project = this.getProject(userId, projectId);
      if (!project) {
        return null;
      }

      const completed = project.completedTaskIds.length;
      const total = project.taskIds.length;

      return {
        completed,
        total,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    } catch (error) {
      logger.error('Failed to get project progress', { userId, projectId, error });
      return null;
    }
  }

  deleteProject(userId: string, projectId: string): boolean {
    try {
      const data = this.jsonStore.read();
      if (!data.projects?.[userId]) {
        return false;
      }

      const userProjects = data.projects[userId];
      const index = userProjects.findIndex((p: ProjectState) => p.id === projectId);

      if (index === -1) {
        return false;
      }

      userProjects.splice(index, 1);
      this.jsonStore.write(data);

      logger.info('Project deleted', { userId, projectId });

      return true;
    } catch (error) {
      logger.error('Failed to delete project', { userId, projectId, error });
      return false;
    }
  }
}
