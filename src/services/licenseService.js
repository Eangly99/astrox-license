import License from '../db/models/License.js';
import Plugin from '../db/models/Plugin.js';
import Blacklist from '../db/models/Blacklist.js';
import AuditLog from '../db/models/AuditLog.js';
import {
  generateLicenseKey,
  verifyLicenseKey,
  signJwt,
  hashHwid,
  maskKey,
} from './cryptoService.js';
import { cacheService } from './cacheService.js';
import {
  LICENSE_STATUS,
  LICENSE_TYPES,
  AUDIT_ACTIONS,
  BLACKLIST_TYPES,
  SHARED_DETECTION_THRESHOLD,
  SHARED_DETECTION_WINDOW_MS,
} from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('license-service');

/**
 * Create a new license key for a user and plugin.
 */
export async function createLicense(
  { pluginId, ownerId, ownerTag, type, duration, maxIps = 1 },
  actorId,
) {
  log.info({ pluginId, ownerId, type, maxIps, actorId }, 'Creating license...');

  const plugin = await Plugin.findById(pluginId);
  if (!plugin) {
    throw new Error('Plugin not found');
  }

  const key = generateLicenseKey();

  let expiresAt = null;
  if (type !== LICENSE_TYPES.LIFETIME) {
    if (!duration) {
      throw new Error('Duration is required for non-lifetime licenses');
    }
    const ms = parseInt(duration, 10);
    if (isNaN(ms) || ms <= 0) {
      throw new Error('Invalid duration provided');
    }
    expiresAt = new Date(Date.now() + ms);
  }

  const license = await License.create({
    key,
    pluginId,
    ownerId,
    ownerTag,
    type,
    maxIps,
    expiresAt,
  });

  await AuditLog.log(AUDIT_ACTIONS.GENERATE, actorId, key, {
    pluginSlug: plugin.slug,
    ownerId,
    type,
    maxIps,
    expiresAt,
  });

  log.info({ key: maskKey(key), ownerId }, 'License created successfully');
  return license;
}

/**
 * Validate a license during handshake.
 */
export async function validateLicense({ licenseKey, pluginId, serverIp, hwid }) {
  const cacheKey = `validate:${licenseKey}:${pluginId}:${serverIp}:${hwid}`;

  // 1. Check cache first
  const cached = await cacheService.get(cacheKey);
  if (cached) {
    log.debug({ key: maskKey(licenseKey) }, 'License validation served from cache');
    return cached;
  }

  // 2. Verify HMAC signature
  if (!verifyLicenseKey(licenseKey)) {
    log.warn({ key: maskKey(licenseKey) }, 'License key failed cryptographic signature check');
    return { valid: false, reason: 'Invalid license key signature' };
  }

  const hashedHwid = hashHwid(hwid);

  // 3. Check Blacklist
  const blacklisted = await Blacklist.findOne({
    $or: [
      { type: BLACKLIST_TYPES.KEY, value: licenseKey },
      { type: BLACKLIST_TYPES.HWID, value: hashedHwid },
      { type: BLACKLIST_TYPES.IP, value: serverIp },
    ],
  }).lean();

  if (blacklisted) {
    log.warn(
      { key: maskKey(licenseKey), ip: serverIp, type: blacklisted.type },
      'Block list match detected during validation',
    );
    return { valid: false, reason: 'This entity has been blacklisted' };
  }

  // 4. Find license in MongoDB
  const license = await License.findOne({ key: licenseKey }).populate('pluginId');
  if (!license) {
    log.warn({ key: maskKey(licenseKey) }, 'License not found in database');
    return { valid: false, reason: 'License key not registered' };
  }

  // 5. Verify plugin slug or ID matches
  const pluginMatch =
    license.pluginId._id.toString() === pluginId ||
    license.pluginId.slug.toLowerCase() === pluginId.toLowerCase();

  if (!pluginMatch) {
    log.warn(
      { key: maskKey(licenseKey), expected: license.pluginId.slug, got: pluginId },
      'Plugin ID mismatch',
    );
    return { valid: false, reason: 'License key is not valid for this plugin' };
  }

  // 6. Check status and expiry
  if (license.status === LICENSE_STATUS.REVOKED) {
    return { valid: false, reason: 'License has been revoked' };
  }
  if (license.status === LICENSE_STATUS.SUSPENDED) {
    return { valid: false, reason: 'License is suspended' };
  }

  if (license.expiresAt && new Date() > license.expiresAt) {
    if (license.status !== LICENSE_STATUS.EXPIRED) {
      license.status = LICENSE_STATUS.EXPIRED;
      await license.save();
      await AuditLog.log(AUDIT_ACTIONS.SUSPEND, 'system', licenseKey, {
        reason: 'License expired',
      });
    }
    return { valid: false, reason: 'License has expired' };
  }

  // 7. Bind HWID on first use or verify match
  if (!license.hwid) {
    license.hwid = hashedHwid;
    license.activatedAt = new Date();
    log.info({ key: maskKey(licenseKey), hwid: hashedHwid }, 'License bound to HWID on first use');
  } else if (license.hwid !== hashedHwid) {
    log.warn(
      { key: maskKey(licenseKey), expected: license.hwid, got: hashedHwid },
      'HWID mismatch',
    );
    return { valid: false, reason: 'Hardware ID binding mismatch' };
  }

  // 8. Whitelist IP or check limit
  if (!license.allowedIps.includes(serverIp)) {
    if (license.allowedIps.length >= license.maxIps) {
      log.warn(
        { key: maskKey(licenseKey), count: license.allowedIps.length, max: license.maxIps },
        'IP limit exceeded',
      );
      return { valid: false, reason: 'Maximum IP limit exceeded' };
    }
    license.allowedIps.push(serverIp);
    log.info({ key: maskKey(licenseKey), ip: serverIp }, 'New IP added to license whitelist');
  }

  // 9. Shared detection check
  let validationIps = license.metadata?.get('validationIps') || [];
  const now = Date.now();
  // Filter out ips older than 24 hours
  validationIps = validationIps.filter(
    (item) => now - new Date(item.timestamp).getTime() < SHARED_DETECTION_WINDOW_MS,
  );

  if (!validationIps.some((item) => item.ip === serverIp)) {
    validationIps.push({ ip: serverIp, timestamp: new Date() });
  }
  license.metadata.set('validationIps', validationIps);

  const uniqueIps24h = new Set(validationIps.map((item) => item.ip)).size;
  if (uniqueIps24h > SHARED_DETECTION_THRESHOLD) {
    license.status = LICENSE_STATUS.SUSPENDED;
    await license.save();

    await AuditLog.log(AUDIT_ACTIONS.SUSPEND, 'system', licenseKey, {
      reason: 'Shared license usage: unique IPs > threshold',
      uniqueIpsCount: uniqueIps24h,
    });

    log.warn({ key: maskKey(licenseKey), uniqueIps24h }, 'License suspended due to shared usage');
    return { valid: false, reason: 'Suspended: Shared license usage detected' };
  }

  // 10. Update validation timestamp
  license.lastValidatedAt = new Date();
  await license.save();

  // 11. Create signed token (JWT)
  const token = await signJwt({
    licenseId: license._id,
    pluginSlug: license.pluginId.slug,
    ownerId: license.ownerId,
    hwid: hashedHwid,
  });

  const result = { valid: true, token };

  // 12. Cache verification success (60s TTL)
  await cacheService.set(cacheKey, result, 60000);

  return result;
}

/**
 * Revoke a license key.
 */
export async function revokeLicense(key, actorId, reason = 'No reason provided') {
  log.info({ key: maskKey(key), actorId }, 'Revoking license...');

  const license = await License.findOne({ key });
  if (!license) {
    throw new Error('License not found');
  }

  license.status = LICENSE_STATUS.REVOKED;
  await license.save();

  await AuditLog.log(AUDIT_ACTIONS.REVOKE, actorId, key, { reason });
  await cacheService.delete(`validate:${key}`);

  log.info({ key: maskKey(key) }, 'License successfully revoked');
  return license;
}

/**
 * Transfer ownership of a license key.
 */
export async function transferLicense(key, newOwnerId, newOwnerTag, actorId) {
  log.info({ key: maskKey(key), newOwnerId, actorId }, 'Transferring license...');

  const license = await License.findOne({ key });
  if (!license) {
    throw new Error('License not found');
  }

  const oldOwnerId = license.ownerId;
  license.ownerId = newOwnerId;
  license.ownerTag = newOwnerTag;

  // Reset hardware lock and whitelisted IPs on transfer
  license.hwid = null;
  license.allowedIps = [];
  license.activatedAt = null;
  if (license.metadata) {
    license.metadata.delete('validationIps');
  }

  await license.save();

  await AuditLog.log(AUDIT_ACTIONS.TRANSFER, actorId, key, {
    oldOwnerId,
    newOwnerId,
    newOwnerTag,
  });

  await cacheService.delete(`validate:${key}`);

  log.info({ key: maskKey(key), oldOwnerId, newOwnerId }, 'License transfer completed');
  return license;
}

/**
 * Suspend a license key.
 */
export async function suspendLicense(key, actorId, reason = 'No reason provided') {
  log.info({ key: maskKey(key), actorId }, 'Suspending license...');

  const license = await License.findOne({ key });
  if (!license) {
    throw new Error('License not found');
  }

  license.status = LICENSE_STATUS.SUSPENDED;
  await license.save();

  await AuditLog.log(AUDIT_ACTIONS.SUSPEND, actorId, key, { reason });
  await cacheService.delete(`validate:${key}`);

  return license;
}

/**
 * List licenses with filters and pagination.
 */
export async function listLicenses({ ownerId, pluginId, status, page = 1, limit = 10 }) {
  const query = {};
  if (ownerId) query.ownerId = ownerId;
  if (pluginId) query.pluginId = pluginId;
  if (status) query.status = status;

  const total = await License.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const skip = (currentPage - 1) * limit;

  const licenses = await License.find(query)
    .populate('pluginId')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    licenses,
    total,
    page: currentPage,
    totalPages,
  };
}

/**
 * Get license details by full key.
 */
export async function getLicenseByKey(key) {
  return await License.findOne({ key }).populate('pluginId').lean();
}

/**
 * Get dashboard stats summaries.
 */
export async function getStats() {
  const total = await License.countDocuments();
  const active = await License.countDocuments({ status: LICENSE_STATUS.ACTIVE });
  const suspended = await License.countDocuments({ status: LICENSE_STATUS.SUSPENDED });
  const revoked = await License.countDocuments({ status: LICENSE_STATUS.REVOKED });
  const expired = await License.countDocuments({ status: LICENSE_STATUS.EXPIRED });

  // Breakdown by type
  const typeBreakdown = await License.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]);

  // Breakdown by plugin
  const pluginBreakdown = await License.aggregate([
    {
      $group: {
        _id: '$pluginId',
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'plugins',
        localField: '_id',
        foreignField: '_id',
        as: 'pluginInfo',
      },
    },
    { $unwind: '$pluginInfo' },
    {
      $project: {
        name: '$pluginInfo.name',
        slug: '$pluginInfo.slug',
        count: 1,
      },
    },
  ]);

  return {
    total,
    active,
    suspended,
    revoked,
    expired,
    types: typeBreakdown.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
    plugins: pluginBreakdown,
  };
}

/**
 * Update whitelisted IP addresses for a user's license.
 */
export async function updateLicenseIps(key, ownerId, ips, actorId) {
  log.info(
    { key: maskKey(key), ownerId, ipsCount: ips.length, actorId },
    'Updating whitelisted IPs...',
  );

  const license = await License.findOne({ key, ownerId });
  if (!license) {
    throw new Error('License not found or does not belong to you.');
  }

  if (license.status !== LICENSE_STATUS.ACTIVE) {
    throw new Error(`Cannot update IPs on a ${license.status} license.`);
  }

  if (ips.length > license.maxIps) {
    throw new Error(
      `IP limit exceeded. Maximum allowed: ${license.maxIps}, provided: ${ips.length}`,
    );
  }

  const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
  for (const ip of ips) {
    if (!ipRegex.test(ip)) {
      throw new Error(`Invalid IPv4 address format: ${ip}`);
    }
  }

  const oldIps = [...license.allowedIps];
  license.allowedIps = ips;
  await license.save();

  // Audit log
  await AuditLog.log(AUDIT_ACTIONS.UPDATE_IPS, actorId, key, {
    oldIps,
    newIps: ips,
  });

  // Clear validation cache prefix if possible
  await cacheService.delete(`validate:${key}`);

  log.info({ key: maskKey(key), ownerId }, 'License IPs updated successfully');
  return license;
}
