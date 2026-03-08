/**
 * Onboarding State Store
 * Manages onboarding state for new users
 */

import { DB } from './db.js';
import { OnboardingState } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';

export class OnboardingStore {
  private store = DB.getInstance();

  /**
   * Get onboarding state for a user
   */
  getState(userId: string): OnboardingState | null {
    try {
      const state = this.store.getOnboarding(userId);
      if (!state) return null;

      return {
        userId: state.userId,
        isCompleted: Boolean(state.isCompleted),
        currentStep: state.currentStep,
        answers: state.answers,
        startedAt: state.startedAt ? new Date(state.startedAt) : undefined,
        completedAt: state.completedAt ? new Date(state.completedAt) : undefined
      };
    } catch (error) {
      logger.error('Failed to get onboarding state', error);
      throw new StorageError(`Failed to get onboarding state: ${error}`);
    }
  }

  /**
   * Initialize onboarding for a new user
   */
  initializeOnboarding(userId: string): void {
    try {
      this.store.initializeOnboarding(userId);
      logger.info('Onboarding initialized', { userId });
    } catch (error) {
      logger.error('Failed to initialize onboarding', error);
      throw new StorageError(`Failed to initialize onboarding: ${error}`);
    }
  }

  /**
   * Update onboarding state
   */
  updateState(userId: string, updates: Partial<OnboardingState>): void {
    try {
      this.store.updateOnboarding(userId, updates);
      logger.info('Onboarding state updated', { userId, updates });
    } catch (error) {
      logger.error('Failed to update onboarding state', error);
      throw new StorageError(`Failed to update onboarding state: ${error}`);
    }
  }

  /**
   * Check if user has completed onboarding
   */
  isCompleted(userId: string): boolean {
    try {
      return this.store.isOnboardingComplete(userId);
    } catch (error) {
      logger.error('Failed to check onboarding completion', error);
      throw new StorageError(`Failed to check onboarding completion: ${error}`);
    }
  }

  /**
   * Mark onboarding as completed
   */
  markCompleted(userId: string): void {
    try {
      this.store.markOnboardingComplete(userId);
      logger.info('Onboarding marked as completed', { userId });
    } catch (error) {
      logger.error('Failed to mark onboarding as completed', error);
      throw new StorageError(`Failed to mark onboarding as completed: ${error}`);
    }
  }
}
