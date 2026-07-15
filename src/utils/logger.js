import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: { service: 'cipher-license' },
  serializers: {
    err: pino.stdSerializers.err,
  },
});

/**
 * Create a child logger scoped to a component.
 * @param {string} component
 * @returns {import('pino').Logger}
 */
export function createLogger(component) {
  return logger.child({ component });
}
