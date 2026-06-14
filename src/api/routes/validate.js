import { validateLicense } from '../../services/licenseService.js';
import { createLogger } from '../../utils/logger.js';
import { maskKey } from '../../utils/formatters.js';

const log = createLogger('api-validate');

/**
 * Route handler plugin for license validation.
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function (fastify) {
  fastify.post(
    '/api/v1/validate',
    {
      schema: {
        body: {
          type: 'object',
          required: ['licenseKey', 'pluginId', 'serverIp', 'hwid'],
          properties: {
            licenseKey: { type: 'string', minLength: 1 },
            pluginId: { type: 'string', minLength: 1 },
            serverIp: {
              type: 'string',
              pattern: '^((25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(25[0-5]|2[0-4]\\d|[01]?\\d\\d?)$',
            },
            hwid: { type: 'string', minLength: 8, maxLength: 128 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              token: { type: 'string' },
              discord: {
                type: 'object',
                properties: {
                  ownerId: { type: 'string' },
                  ownerTag: { type: 'string' },
                },
                required: ['ownerId', 'ownerTag'],
              },
            },
            required: ['status', 'token', 'discord'],
          },
          400: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
            required: ['error'],
          },
          403: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              error: { type: 'string' },
            },
            required: ['status', 'error'],
          },
          500: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
            required: ['error'],
          },
        },
      },
      errorHandler: (error, request, reply) => {
        if (error.validation) {
          log.warn(
            { err: error.validation, ip: request.ip },
            'Malformed validation request schema rejected',
          );
          return reply.code(400).send({ error: 'Invalid request' });
        }
        reply.send(error);
      },
    },
    async (request, reply) => {
      const { licenseKey, pluginId, serverIp, hwid } = request.body;
      const { ip } = request;

    try {
      log.info(
        {
          key: maskKey(licenseKey),
          pluginId,
          serverIp,
          clientIp: ip,
        },
        'License validation request received',
      );

      // 2. Perform validation pipeline checks
      const result = await validateLicense({
        licenseKey,
        pluginId,
        serverIp,
        hwid,
      });

      if (result.valid) {
        log.info({ key: maskKey(licenseKey) }, 'License validation handshake successful');
        return reply.code(200).send({
          status: 'valid',
          token: result.token,
          discord: {
            ownerId: result.discord.ownerId,
            ownerTag: result.discord.ownerTag,
          },
        });
      }

      log.warn(
        {
          key: maskKey(licenseKey),
          reason: result.reason,
        },
        'License validation handshake rejected',
      );

      // Obfuscated error response to protect system signature mechanics
      return reply.code(403).send({
        status: 'invalid',
        error: 'License validation failed',
      });
    } catch (error) {
      log.error(
        { err: error, key: maskKey(licenseKey) },
        'Unexpected exception during validation handler',
      );
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}
