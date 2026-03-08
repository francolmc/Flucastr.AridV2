/**
 * System Prompt Builder Tests
 */

import { describe, test, expect } from '@jest/globals';
import { SystemPromptBuilder } from '../../src/brain/system-prompt.js';
import { Profile } from '../../src/config/types.js';

describe('SystemPromptBuilder', () => {
  test('should build system prompt with default profile', () => {
    const profile: Profile = {
      userId: 'test-user',
      agentName: 'Arid',
      agentTone: 'casual'
    };

    const prompt = SystemPromptBuilder.build(profile);

    expect(prompt).toContain('Eres Arid');
    expect(prompt).toContain('casual');
    expect(prompt).toBeTruthy();
  });

  test('should build system prompt with user name', () => {
    const profile: Profile = {
      userId: 'test-user',
      agentName: 'Arid',
      agentTone: 'formal',
      userName: 'Franco'
    };

    const prompt = SystemPromptBuilder.build(profile);

    expect(prompt).toContain('Franco');
    expect(prompt).toContain('formal');
  });

  test('should generate prompt under 1000 tokens', () => {
    const profile: Profile = {
      userId: 'test-user',
      agentName: 'Arid',
      agentTone: 'divertido',
      userName: 'TestUser',
      preferences: 'Me gusta hablar de tecnología'
    };

    const prompt = SystemPromptBuilder.build(profile);
    const estimatedTokens = SystemPromptBuilder.estimateTokens(prompt);

    // System prompt includes EMOCIONALIDAD section which adds ~400 tokens
    expect(estimatedTokens).toBeLessThan(1000);
  });

  test('should support different tones', () => {
    const tones = ['casual', 'formal', 'divertido'];

    for (const tone of tones) {
      const profile: Profile = {
        userId: 'test-user',
        agentName: 'Arid',
        agentTone: tone
      };

      const prompt = SystemPromptBuilder.build(profile);
      expect(prompt).toContain(tone);
    }
  });
});
