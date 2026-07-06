import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import validateRoute from './routes/validate.js';
import presenceRoute from './routes/presence.js';
import adminRoute from './routes/admin.js';
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
    max: config.NODE_ENV === 'test' ? 10000 : RATE_LIMITS.API_MAX,
    timeWindow: RATE_LIMITS.API_WINDOW,
    skip: (request) => {
      // Exempt admin dashboard routes from the global rate limit
      return request.url.startsWith('/api/v1/admin');
    },
    errorResponseBuilder: (request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${context.after}.`,
    }),
  });

  // 2. Manual CORS Hook
  fastify.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (config.NODE_ENV === 'production') {
      if (config.DASHBOARD_URL && config.DASHBOARD_URL !== '*') {
        const allowedOrigins = config.DASHBOARD_URL.split(',').map((o) => o.trim());
        const originMatched = origin && (
          allowedOrigins.includes(origin) ||
          allowedOrigins.some(pattern => {
            if (pattern.includes('*')) {
              const regexPattern = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '[^/]+') + '$');
              return regexPattern.test(origin);
            }
            return false;
          })
        );
        if (originMatched) {
          reply.header('Access-Control-Allow-Origin', origin);
        } else {
          reply.header('Access-Control-Allow-Origin', allowedOrigins[0]);
        }
      } else {
        reply.header('Access-Control-Allow-Origin', origin || '*');
      }
    } else {
      reply.header('Access-Control-Allow-Origin', origin || '*');
    }
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (request.method === 'OPTIONS') {
      return reply.code(204).send();
    }
  });

  // 3. Health check route
  fastify.get('/api/v1/health', async () => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  // 4. Handshake validation route
  await fastify.register(validateRoute);

  // 4.5 SaaS Presence resolution route
  await fastify.register(presenceRoute);

  // 5. Admin routes
  await fastify.register(adminRoute);
}

let initPromise = null;

/**
 * Ensure Fastify server plugins/routes are registered.
 */
export async function ensureServerSetup() {
  if (!initPromise) {
    initPromise = setupServer();
  }
  return initPromise;
}

/**
 * Start Fastify REST API.
 */
export async function startApi() {
  await ensureServerSetup();
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
