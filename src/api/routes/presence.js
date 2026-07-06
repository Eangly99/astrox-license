import { validateLicense } from '../../services/licenseService.js';
import { signData } from '../../services/signatureService.js';
import { createLogger } from '../../utils/logger.js';
import { maskKey } from '../../utils/formatters.js';

const log = createLogger('api-presence');

function resolveTemplates(templates, variables) {
  if (typeof templates === 'string') {
    return templates.replace(/\{([^{}]+)\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  } else if (Array.isArray(templates)) {
    return templates.map(item => resolveTemplates(item, variables));
  } else if (typeof templates === 'object' && templates !== null) {
    const resolved = {};
    for (const [key, value] of Object.entries(templates)) {
      resolved[key] = resolveTemplates(value, variables);
    }
    return resolved;
  }
  return templates;
}

/**
 * Route handler for SaaS/Backend Presence dependency model.
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function (fastify) {
  fastify.post(
    '/api/v1/presence',
    {
      schema: {
        body: {
          type: 'object',
          required: ['licenseKey', 'pluginId', 'serverIp', 'hwid', 'templates', 'variables'],
          properties: {
            licenseKey: { type: 'string', minLength: 1 },
            pluginId: { type: 'string', minLength: 1 },
            serverIp: { type: 'string' },
            hwid: { type: 'string', minLength: 8, maxLength: 128 },
            port: { type: 'integer', minimum: 1, maximum: 65535 },
            templates: { type: 'object' },
            variables: { type: 'object' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              data: { type: 'object' },
              signature: { type: 'string' },
            },
            required: ['status', 'data', 'signature'],
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
      const { licenseKey, pluginId, serverIp, hwid, port, templates, variables } = request.body;

      try {
        // Validate license first
        const validationResult = await validateLicense({
          licenseKey,
          pluginId,
          serverIp,
          hwid,
          port,
        });

        if (!validationResult.valid) {
          log.warn(
            {
              key: maskKey(licenseKey),
              reason: validationResult.reason,
            },
            'License check failed for presence resolution',
          );
          return reply.code(403).send({
            status: 'invalid',
            error: 'License validation failed: ' + (validationResult.reason || 'Unknown reason'),
          });
        }

        // Resolve templates using variables
        const resolvedData = resolveTemplates(templates, variables);

        // Serialize and sign
        const serialized = JSON.stringify(resolvedData);
        const signature = signData(serialized);

        return reply.code(200).send({
          status: 'valid',
          data: resolvedData,
          signature: signature,
        });
      } catch (error) {
        log.error(
          { err: error, key: maskKey(licenseKey) },
          'Unexpected exception during presence resolution handler',
        );
        return reply.code(500).send({ error: 'Internal server error' });
      }
    },
  );
}
