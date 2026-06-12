import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import validateRoute from './routes/validate.js';
import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';
import { RATE_LIMITS } from '../utils/constants.js';

const log = createLogger('api-server');

export const fastify = Fastify({
  logger: false, // Override built-in logging
  disableRequestLogging: true,
  trustProxy: config.NODE_ENV === 'production' || !!config.REDIS_URI,
});

// Register Plugins & Routes
async function setupServer() {
  // 1. Rate Limiting per IP
  await fastify.register(rateLimit, {
    max: RATE_LIMITS.API_MAX,
    timeWindow: RATE_LIMITS.API_WINDOW,
    errorResponseBuilder: (request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${context.after}.`,
    }),
  });

  // 2. Health check route
  fastify.get('/api/v1/health', async () => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  // 3. Handshake validation route
  await fastify.register(validateRoute);
}

// Setup hook
const initPromise = setupServer();

/**
 * Start Fastify REST API.
 */
export async function startApi() {
  await initPromise;
  try {
    const address = await fastify.listen({
      port: config.API_PORT,
      host: '0.0.0.0',
    });
    log.info({ address }, `API Handshake Server listening`);
  } catch (err) {
    log.error({ err }, 'Fastify failed to start');
    throw err;
  }
}

/**
 * Stop Fastify REST API gracefully.
 */
export async function stopApi() {
  log.info('Draining Fastify REST connection pool...');
  try {
    await fastify.close();
    log.info('API Handshake Server stopped');
  } catch (err) {
    log.error({ err }, 'Error closing API Handshake Server');
  }
}
