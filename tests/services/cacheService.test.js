import { describe, it, expect, beforeAll } from 'vitest';
import { cacheService } from '../../src/services/cacheService.js';

describe('Cache Service Tests', () => {
  beforeAll(async () => {
    await cacheService.clear();
  });

  it('should store and retrieve items', async () => {
    const success = await cacheService.set('test-key', { val: 42 });
    expect(success).toBe(true);

    const data = await cacheService.get('test-key');
    expect(data).toEqual({ val: 42 });
  });

  it('should delete keys', async () => {
    await cacheService.set('delete-key', 'value');
    const delRes = await cacheService.delete('delete-key');
    expect(delRes).toBe(true);

    const val = await cacheService.get('delete-key');
    expect(val).toBeUndefined();
  });

  it('should clear all entries', async () => {
    await cacheService.set('k1', 1);
    await cacheService.set('k2', 2);
    await cacheService.clear();

    expect(await cacheService.get('k1')).toBeUndefined();
    expect(await cacheService.get('k2')).toBeUndefined();
  });
});
