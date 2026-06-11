import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('cache-service');

let keyvInstance;

try {
  if (config.REDIS_URI) {
    log.info({ uri: config.REDIS_URI.replace(/:[^:]*@/, ':****@') }, 'Initializing Redis Cache...');
    keyvInstance = new Keyv(new KeyvRedis(config.REDIS_URI));
  } else {
    log.info('Initializing In-Memory Cache (No Redis URI configured)...');
    keyvInstance = new Keyv();
  }
} catch (error) {
  log.error({ err: error }, 'Failed to initialize cache backend. Falling back to in-memory.');
  keyvInstance = new Keyv();
}

export const cacheService = {
  /**
   * Retrieve a value from the cache.
   * @param {string} key
   * @returns {Promise<any>}
   */
  async get(key) {
    try {
      return await keyvInstance.get(key);
    } catch (err) {
      log.error({ err, key }, 'Cache get operation failed');
      return undefined;
    }
  },

  /**
   * Store a value in the cache with an optional TTL (in milliseconds).
   * @param {string} key
   * @param {any} value
   * @param {number} [ttlMs]
   * @returns {Promise<boolean>}
   */
  async set(key, value, ttlMs) {
    try {
      await keyvInstance.set(key, value, ttlMs);
      return true;
    } catch (err) {
      log.error({ err, key }, 'Cache set operation failed');
      return false;
    }
  },

  /**
   * Delete a value from the cache.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    try {
      return await keyvInstance.delete(key);
    } catch (err) {
      log.error({ err, key }, 'Cache delete operation failed');
      return false;
    }
  },

  /**
   * Clear all entries from the cache.
   * @returns {Promise<boolean>}
   */
  async clear() {
    try {
      await keyvInstance.clear();
      return true;
    } catch (err) {
      log.error({ err }, 'Cache clear operation failed');
      return false;
    }
  },
};
