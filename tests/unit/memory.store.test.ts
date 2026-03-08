/**
 * Tests for MemoryStore
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { MemoryStore } from '../../src/storage/memory.store.js';
import { DB } from '../../src/storage/db.js';
import { Memory } from '../../src/config/types.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('MemoryStore', () => {
  let memoryStore: MemoryStore;
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'aridv2-test-'));
    const dbPath = join(tempDir, 'test.json');

    // Initialize database
    await DB.initialize(dbPath);

    // Create store instance
    memoryStore = new MemoryStore();
  });

  afterAll(async () => {
    // Cleanup
    await DB.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('should save a new memory', () => {
    const memory = memoryStore.saveMemory({
      userId: 'test-user',
      category: 'fact',
      content: 'Es desarrollador fullstack',
      source: 'test',
      importance: 0.9,
      accessCount: 0
    });

    expect(memory.id).toBeDefined();
    expect(memory.content).toBe('Es desarrollador fullstack');
    expect(memory.category).toBe('fact');
    expect(memory.importance).toBe(0.9);
    expect(memory.createdAt).toBeInstanceOf(Date);
  });

  test('should retrieve memories sorted by importance', () => {
    // Save multiple memories with different importance scores
    memoryStore.saveMemory({
      userId: 'test-user',
      category: 'preference',
      content: 'Prefiere TypeScript',
      source: 'test',
      importance: 0.7,
      accessCount: 0
    });

    memoryStore.saveMemory({
      userId: 'test-user',
      category: 'project',
      content: 'Está trabajando en AridV2',
      source: 'test',
      importance: 0.95,
      accessCount: 0
    });

    const memories = memoryStore.getMemories('test-user');

    // Should be sorted by importance (highest first)
    expect(memories.length).toBeGreaterThanOrEqual(3);
    expect(memories[0].importance).toBeGreaterThanOrEqual(memories[1].importance);
    expect(memories[1].importance).toBeGreaterThanOrEqual(memories[2].importance);
  });

  test('should limit number of memories returned', () => {
    const memories = memoryStore.getMemories('test-user', 2);
    expect(memories.length).toBe(2);
  });

  test('should filter memories by category', () => {
    const factMemories = memoryStore.getMemoriesByCategory('test-user', 'fact');

    expect(factMemories.length).toBeGreaterThan(0);
    factMemories.forEach(m => {
      expect(m.category).toBe('fact');
    });
  });

  test('should search memories by content', () => {
    const results = memoryStore.searchMemories('test-user', 'TypeScript');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content.toLowerCase()).toContain('typescript');
  });

  test('should mark memory as accessed', () => {
    const memories = memoryStore.getMemories('test-user');
    const memoryId = memories[0].id;

    memoryStore.markAccessed(memoryId, 'test-user');

    const updated = memoryStore.getMemories('test-user');
    const accessedMemory = updated.find((m: Memory) => m.id === memoryId);

    expect(accessedMemory?.accessCount).toBeGreaterThan(0);
    expect(accessedMemory?.lastAccessed).toBeDefined();
  });

  test('should update memory importance', () => {
    const memories = memoryStore.getMemories('test-user');
    const memoryId = memories[0].id;

    memoryStore.updateImportance(memoryId, 'test-user', 0.5);

    const updated = memoryStore.getMemories('test-user');
    const updatedMemory = updated.find((m: Memory) => m.id === memoryId);

    expect(updatedMemory?.importance).toBe(0.5);
  });

  test('should get total memory count', () => {
    const count = memoryStore.getCount('test-user');
    expect(count).toBeGreaterThan(0);
  });

  test('should return empty array for user with no memories', () => {
    const memories = memoryStore.getMemories('nonexistent-user');
    expect(memories).toEqual([]);
  });

  test('should validate importance range', () => {
    const memories = memoryStore.getMemories('test-user');
    const memoryId = memories[0].id;

    expect(() => {
      memoryStore.updateImportance(memoryId, 'test-user', 1.5);
    }).toThrow();

    expect(() => {
      memoryStore.updateImportance(memoryId, 'test-user', -0.5);
    }).toThrow();
  });
});
