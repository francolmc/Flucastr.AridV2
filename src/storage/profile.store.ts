/**
 * Profile Store
 * Manages user and agent profiles
 */

import { DB } from './db.js';
import { Profile } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';

export class ProfileStore {
  private store = DB.getInstance();

  /**
   * Get or create profile for a user
   */
  getProfile(userId: string): Profile {
    try {
      const profile = this.store.getProfile(userId);

      return {
        userId: profile.userId,
        agentName: profile.agentName,
        agentTone: profile.agentTone,
        userName: profile.userName,
        preferences: profile.preferences,
        profileMarkdown: profile.profileMarkdown,
        updatedAt: profile.updatedAt ? new Date(profile.updatedAt) : undefined
      };
    } catch (error) {
      logger.error('Failed to get profile', error);
      throw new StorageError(`Failed to get profile: ${error}`);
    }
  }

  /**
   * Update profile
   */
  updateProfile(profile: Partial<Profile> & { userId: string }): void {
    try {
      const updates: any = {};

      if (profile.agentName !== undefined) updates.agentName = profile.agentName;
      if (profile.agentTone !== undefined) updates.agentTone = profile.agentTone;
      if (profile.userName !== undefined) updates.userName = profile.userName;
      if (profile.preferences !== undefined) updates.preferences = profile.preferences;
      if (profile.profileMarkdown !== undefined) updates.profileMarkdown = profile.profileMarkdown;

      this.store.updateProfile(profile.userId, updates);
      logger.info('Profile updated', { userId: profile.userId });
    } catch (error) {
      logger.error('Failed to update profile', error);
      throw new StorageError(`Failed to update profile: ${error}`);
    }
  }

  /**
   * Check if profile exists
   */
  profileExists(userId: string): boolean {
    try {
      const profile = this.store.getProfile(userId);
      return !!profile;
    } catch (error) {
      logger.error('Failed to check profile existence', error);
      throw new StorageError(`Failed to check profile existence: ${error}`);
    }
  }
}
