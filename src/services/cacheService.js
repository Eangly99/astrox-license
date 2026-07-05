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

const TIMEOUT_MS = 3000;

function withTimeout(promise, defaultValue) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      log.error('Cache operation timed out');
      resolve(defaultValue);
    }, TIMEOUT_MS);

    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        log.error({ err }, 'Cache operation failed');
        resolve(defaultValue);
      });
  });
}

export const cacheService = {
  /**
   * Retrieve a value from the cache.
   * @param {string} key
   * @returns {Promise<any>}
   */
  async get(key) {
    return withTimeout(keyvInstance.get(key), undefined);
  },

  /**
   * Store a value in the cache with an optional TTL (in milliseconds).
   * @param {string} key
   * @param {any} value
   * @param {number} [ttlMs]
   * @returns {Promise<boolean>}
   */
  async set(key, value, ttlMs) {
    return withTimeout(keyvInstance.set(key, value, ttlMs), false);
  },

  /**
   * Delete a value from the cache.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    return withTimeout(keyvInstance.delete(key), false);
  },

  /**
   * Clear all entries from the cache.
   * @returns {Promise<boolean>}
   */
  async clear() {
    return withTimeout(keyvInstance.clear(), false);
  },
};
