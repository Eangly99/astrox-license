import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('cache-service');

let keyvInstance;
let isRedisHealthy = true;
let consecutiveFailures = 0;
const FAILURE_THRESHOLD = 3;
let fallbackMemoryInstance = null;
let recoveryTimer = null;
let lastCacheErrorLoggedTime = 0;
const CACHE_LOG_THROTTLE_MS = 30000;

try {
  if (config.REDIS_URI) {
    log.info({ uri: config.REDIS_URI.replace(/:[^:]*@/, ':****@') }, 'Initializing Redis Cache...');
    keyvInstance = new Keyv(new KeyvRedis(config.REDIS_URI));
    
    // Register error handler to prevent process crashes
    keyvInstance.on('error', (err) => {
      const now = Date.now();
      if (now - lastCacheErrorLoggedTime > CACHE_LOG_THROTTLE_MS) {
        log.error({ err }, 'Keyv Redis connection error (throttled)');
        lastCacheErrorLoggedTime = now;
      }
      isRedisHealthy = false;
      handleFailure();
    });
  } else {
    log.info('Initializing In-Memory Cache (No Redis URI configured)...');
    keyvInstance = new Keyv();
  }
} catch (error) {
  log.error({ err: error }, 'Failed to initialize cache backend. Falling back to in-memory.');
  keyvInstance = new Keyv();
}

function handleFailure() {
  if (config.REDIS_URI && !fallbackMemoryInstance) {
    consecutiveFailures++;
    if (consecutiveFailures >= FAILURE_THRESHOLD) {
      log.warn('Redis cache has failed repeatedly. Activating fast in-memory fallback cache...');
      fallbackMemoryInstance = new Keyv();
      fallbackMemoryInstance.on('error', (err) => {
        const now = Date.now();
        if (now - lastCacheErrorLoggedTime > CACHE_LOG_THROTTLE_MS) {
          log.error({ err }, 'Fallback cache error (throttled)');
          lastCacheErrorLoggedTime = now;
        }
      });
      startRecoveryCheck();
    }
  }
}

function handleSuccess() {
  if (config.REDIS_URI && !fallbackMemoryInstance) {
    consecutiveFailures = 0;
    isRedisHealthy = true;
  }
}

function startRecoveryCheck() {
  if (recoveryTimer) return;
  
  // Probe every 30s in production, or 1000ms in test environment
  const interval = config.NODE_ENV === 'test' ? 1000 : 30000;
  
  recoveryTimer = setInterval(async () => {
    log.info('Running background probe to check Redis cache health...');
    try {
      await Promise.race([
        keyvInstance.get('__health_probe__'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Probe timeout')), 1000))
      ]);
      
      log.info('Redis cache connection has recovered. Restoring primary cache...');
      isRedisHealthy = true;
      consecutiveFailures = 0;
      fallbackMemoryInstance = null;
      clearInterval(recoveryTimer);
      recoveryTimer = null;
    } catch (err) {
      log.debug({ err: err.message }, 'Redis cache probe failed. Remaining on in-memory fallback.');
    }
  }, interval);
  
  if (recoveryTimer.unref) {
    recoveryTimer.unref();
  }
}

const TIMEOUT_MS = config.NODE_ENV === 'test' ? 200 : 3000;

function withTimeout(promise, defaultValue) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      log.error('Cache operation timed out');
      handleFailure();
      resolve(defaultValue);
    }, TIMEOUT_MS);

    promise
      .then((val) => {
        clearTimeout(timer);
        handleSuccess();
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        log.error({ err }, 'Cache operation failed');
        handleFailure();
        resolve(defaultValue);
      });
  });
}

function getActiveKeyv() {
  return fallbackMemoryInstance || keyvInstance;
}

export const cacheService = {
  /**
   * Retrieve a value from the cache.
   * @param {string} key
   * @returns {Promise<any>}
   */
  async get(key) {
    return withTimeout(getActiveKeyv().get(key), undefined);
  },

  /**
   * Store a value in the cache with an optional TTL (in milliseconds).
   * @param {string} key
   * @param {any} value
   * @param {number} [ttlMs]
   * @returns {Promise<boolean>}
   */
  async set(key, value, ttlMs) {
    return withTimeout(getActiveKeyv().set(key, value, ttlMs), false);
  },

  /**
   * Delete a value from the cache.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    return withTimeout(getActiveKeyv().delete(key), false);
  },

  /**
   * Clear all entries from the cache.
   * @returns {Promise<boolean>}
   */
  async clear() {
    return withTimeout(getActiveKeyv().clear(), false);
  },
};
