import { validateRequestSchema } from '../../utils/validators.js';
import { validateLicense } from '../../services/licenseService.js';
import { createLogger } from '../../utils/logger.js';
import { maskKey } from '../../services/cryptoService.js';

const log = createLogger('api-validate');

/**
 * Route handler plugin for license validation.
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function (fastify) {
  fastify.post('/api/v1/validate', async (request, reply) => {
    const { body, ip } = request;

    // 1. Zod input validation
    const parsed = validateRequestSchema.safeParse(body);
    if (!parsed.success) {
      log.warn({ err: parsed.error.format(), ip }, 'Malformed validation request schema rejected');
      return reply.code(400).send({ error: 'Invalid request' });
    }

    const { licenseKey, pluginId, serverIp, hwid } = parsed.data;

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
