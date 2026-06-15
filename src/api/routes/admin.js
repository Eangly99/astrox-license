import { jwtVerify } from 'jose';
import { config } from '../../utils/config.js';
import { LICENSE_STATUS, LICENSE_TYPES, AUDIT_ACTIONS, BLACKLIST_TYPES } from '../../utils/constants.js';
import License from '../../db/models/License.js';
import Plugin from '../../db/models/Plugin.js';
import Blacklist from '../../db/models/Blacklist.js';
import AuditLog from '../../db/models/AuditLog.js';
import { cacheService } from '../../services/cacheService.js';
import {
  createLicense,
  revokeLicense,
  suspendLicense,
  reactivateLicense,
  transferLicense,
  updateLicenseIps,
  addBlacklist,
  removeBlacklist,
  getStats,
} from '../../services/licenseService.js';

const secretKey = new TextEncoder().encode(config.HMAC_SECRET);

/**
 * Pre-handler hook to authenticate admin JWT signed by Next.js
 */
async function authenticateAdmin(request, reply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Unauthorized: Missing or malformed token' });
  }
  const token = authHeader.substring(7);
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: 'astrox-license',
      audience: 'astrox-license-admin',
      algorithms: ['HS256'],
    });

    if (!payload.userId || !config.ADMIN_DISCORD_IDS.includes(payload.userId)) {
      return reply.code(403).send({ error: 'Forbidden: Insufficient privileges' });
    }

    request.adminUser = payload;
  } catch (err) {
    return reply.code(401).send({ error: 'Unauthorized: Invalid token' });
  }
}

/**
 * Admin API Routes Fastify Plugin
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function (fastify) {
  // 1. GET /api/v1/admin/stats
  fastify.get('/api/v1/admin/stats', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const stats = await getStats();
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const total7d = await License.countDocuments({ createdAt: { $lt: sevenDaysAgo } });
      const active7d = await License.countDocuments({ status: LICENSE_STATUS.ACTIVE, createdAt: { $lt: sevenDaysAgo } });
      const suspended7d = await License.countDocuments({ status: LICENSE_STATUS.SUSPENDED, createdAt: { $lt: sevenDaysAgo } });
      const revoked7d = await License.countDocuments({ status: LICENSE_STATUS.REVOKED, createdAt: { $lt: sevenDaysAgo } });
      const expired7d = await License.countDocuments({ status: LICENSE_STATUS.EXPIRED, createdAt: { $lt: sevenDaysAgo } });

      const calculateDelta = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return parseFloat((((current - previous) / previous) * 100).toFixed(1));
      };

      const recentLogs = await AuditLog.find().sort({ timestamp: -1 }).limit(10).lean();

      return reply.send({
        ...stats,
        recentLogs,
        deltas: {
          total: calculateDelta(stats.total, total7d),
          active: calculateDelta(stats.active, active7d),
          suspended: calculateDelta(stats.suspended, suspended7d),
          revoked: calculateDelta(stats.revoked, revoked7d),
          expired: calculateDelta(stats.expired, expired7d),
        },
      });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // 2. GET /api/v1/admin/licenses
  fastify.get('/api/v1/admin/licenses', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const { page = 1, limit = 10, status, pluginId, ownerTag } = request.query;

      const query = {};
      if (status) query.status = status;
      if (pluginId) query.pluginId = pluginId;
      if (ownerTag) query.ownerTag = { $regex: ownerTag, $options: 'i' };

      const limitNum = parseInt(limit, 10) || 10;
      const pageNum = parseInt(page, 10) || 1;

      const total = await License.countDocuments(query);
      const totalPages = Math.max(1, Math.ceil(total / limitNum));
      const currentPage = Math.min(pageNum, totalPages);
      const skip = (currentPage - 1) * limitNum;

      const licenses = await License.find(query)
        .populate('pluginId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

      return reply.send({
        licenses: licenses.map((l) => l.toJSON()),
        total,
        page: currentPage,
        limit: limitNum,
        totalPages,
      });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // 3. POST /api/v1/admin/licenses
  fastify.post('/api/v1/admin/licenses', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const { pluginId, ownerId, ownerTag, type, duration, maxIps } = request.body;
      const actorId = request.adminUser.userId;

      const license = await createLicense(
        { pluginId, ownerId, ownerTag, type, duration, maxIps },
        actorId,
      );

      return reply.code(201).send(license.toJSON());
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // 4. GET /api/v1/admin/licenses/:key
  fastify.get('/api/v1/admin/licenses/:key', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const { key } = request.params;
      const license = await License.findOne({ key }).populate('pluginId');
      if (!license) {
        return reply.code(404).send({ error: 'License not found' });
      }

      const { maskKey } = await import('../../utils/formatters.js');
      const maskedKey = maskKey(key);
      const auditLogs = await AuditLog.find({ targetKey: maskedKey }).sort({ timestamp: -1 }).lean();

      return reply.send({
        license: license.toJSON(),
        auditLogs,
      });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // 5. POST /api/v1/admin/licenses/:key/suspend
  fastify.post('/api/v1/admin/licenses/:key/suspend', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const { key } = request.params;
      const { reason } = request.body || {};
      const actorId = request.adminUser.userId;

      const license = await suspendLicense(key, actorId, reason);
      return reply.send(license.toJSON());
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // 6. POST /api/v1/admin/licenses/:key/revoke
  fastify.post('/api/v1/admin/licenses/:key/revoke', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const { key } = request.params;
      const { reason } = request.body || {};
      const actorId = request.adminUser.userId;

      const license = await revokeLicense(key, actorId, reason);
      return reply.send(license.toJSON());
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // 7. POST /api/v1/admin/licenses/:key/reactivate
  fastify.post('/api/v1/admin/licenses/:key/reactivate', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const { key } = request.params;
      const { reason } = request.body || {};
      const actorId = request.adminUser.userId;

      const license = await reactivateLicense(key, actorId, reason);
      return reply.send(license.toJSON());
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // 8. POST /api/v1/admin/licenses/:key/transfer
  fastify.post('/api/v1/admin/licenses/:key/transfer', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const { key } = request.params;
      const { ownerId, ownerTag } = request.body;
      const actorId = request.adminUser.userId;

      if (!ownerId || !ownerTag) {
        return reply.code(400).send({ error: 'ownerId and ownerTag are required' });
      }

      const license = await transferLicense(key, ownerId, ownerTag, actorId);
      return reply.send(license.toJSON());
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // 9. POST /api/v1/admin/licenses/:key/hwid-reset
  fastify.post('/api/v1/admin/licenses/:key/hwid-reset', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const { key } = request.params;
      const actorId = request.adminUser.userId;

      const license = await License.findOne({ key });
      if (!license) {
        return reply.code(404).send({ error: 'License not found' });
      }

      license.hwid = null;
      license.activatedAt = null;

      if (license.activeCacheKeys && license.activeCacheKeys.length > 0) {
        for (const keyToDel of license.activeCacheKeys) {
          await cacheService.delete(keyToDel);
        }
        license.activeCacheKeys = [];
      }
      await license.save();

      await AuditLog.log(AUDIT_ACTIONS.UPDATE_IPS, actorId, key, { hwidReset: true });

      await cacheService.delete(`validate:${key}`);
      await cacheService.delete('stats:dashboard');

      return reply.send(license.toJSON());
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // 10. PUT /api/v1/admin/licenses/:key/ips
  fastify.put('/api/v1/admin/licenses/:key/ips', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const { key } = request.params;
      const { ips } = request.body;
      const actorId = request.adminUser.userId;

      if (!Array.isArray(ips)) {
        return reply.code(400).send({ error: 'ips must be an array' });
      }

      const license = await License.findOne({ key });
      if (!license) {
        return reply.code(404).send({ error: 'License not found' });
      }

      const updatedLicense = await updateLicenseIps(key, license.ownerId, ips, actorId);
      return reply.send(updatedLicense.toJSON());
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // 11. GET /api/v1/admin/plugins
  fastify.get('/api/v1/admin/plugins', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const plugins = await Plugin.find().lean();
      const enriched = await Promise.all(
        plugins.map(async (p) => {
          const licenseCount = await License.countDocuments({ pluginId: p._id });
          return {
            ...p,
            id: p._id.toString(),
            licenseCount,
          };
        }),
      );
      return reply.send(enriched);
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // 12. POST /api/v1/admin/plugins
  fastify.post('/api/v1/admin/plugins', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const { name, slug, version, description } = request.body;
      const actorId = request.adminUser.userId;

      if (!name || !slug) {
        return reply.code(400).send({ error: 'name and slug are required' });
      }

      const existing = await Plugin.findOne({ slug });
      if (existing) {
        return reply.code(400).send({ error: 'Plugin with this slug already exists' });
      }

      const plugin = await Plugin.create({
        name,
        slug,
        version: version || '1.0.0',
        description: description || '',
        createdBy: actorId,
      });

      await cacheService.delete('stats:dashboard');

      return reply.code(201).send(plugin.toJSON());
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // 13. GET /api/v1/admin/blacklist
  fastify.get('/api/v1/admin/blacklist', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const { type } = request.query;
      const query = {};
      if (type) query.type = type;

      const list = await Blacklist.find(query).sort({ createdAt: -1 }).lean();
      return reply.send(list.map(e => ({ ...e, id: e._id.toString() })));
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // 14. POST /api/v1/admin/blacklist
  fastify.post('/api/v1/admin/blacklist', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const { type, value, reason } = request.body;
      const actorId = request.adminUser.userId;

      if (!type || !value || !reason) {
        return reply.code(400).send({ error: 'type, value, and reason are required' });
      }

      const entry = await addBlacklist({ type, value, reason }, actorId);
      await AuditLog.log(AUDIT_ACTIONS.BLACKLIST_ADD, actorId, null, { type, value, reason });

      return reply.code(201).send(entry.toJSON());
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // 15. DELETE /api/v1/admin/blacklist
  fastify.delete('/api/v1/admin/blacklist', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const { type, value } = request.query;
      const actorId = request.adminUser.userId;

      if (!type || !value) {
        return reply.code(400).send({ error: 'type and value are required' });
      }

      const entry = await removeBlacklist({ type, value }, actorId);
      if (!entry) {
        return reply.code(404).send({ error: 'Blacklist entry not found' });
      }

      await AuditLog.log(AUDIT_ACTIONS.BLACKLIST_REMOVE, actorId, null, { type, value });

      return reply.send({ success: true });
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // 16. GET /api/v1/admin/audit
  fastify.get('/api/v1/admin/audit', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      const { page = 1, limit = 10, action, startDate, endDate } = request.query;

      const query = {};
      if (action) query.action = action;
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const limitNum = parseInt(limit, 10) || 10;
      const pageNum = parseInt(page, 10) || 1;

      const total = await AuditLog.countDocuments(query);
      const totalPages = Math.max(1, Math.ceil(total / limitNum));
      const currentPage = Math.min(pageNum, totalPages);
      const skip = (currentPage - 1) * limitNum;

      const logs = await AuditLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

      return reply.send({
        logs: logs.map(e => ({ ...e, id: e._id.toString() })),
        total,
        page: currentPage,
        limit: limitNum,
        totalPages,
      });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
