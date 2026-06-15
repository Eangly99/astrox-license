import mongoose from 'mongoose';
import License from '../db/models/License.js';
import Plugin from '../db/models/Plugin.js';
import Blacklist from '../db/models/Blacklist.js';
import AuditLog from '../db/models/AuditLog.js';
import { generateLicenseKey, verifyLicenseKey, signJwt, hashHwid } from './cryptoService.js';
import { maskKey } from '../utils/formatters.js';
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
import { logValidationToDiscord } from './notificationService.js';

const log = createLogger('license-service');

/**
 * Create a new license key for a user and plugin.
 */
export async function createLicense(
  { pluginId, ownerId, ownerTag, type, duration, maxIps = 1, sharedDetectionThreshold = 3 },
  actorId,
) {
  log.info({ pluginId, ownerId, type, maxIps, actorId }, 'Creating license...');

  if (!mongoose.Types.ObjectId.isValid(pluginId)) {
    throw new Error('Invalid plugin ID format');
  }

  const plugin = await Plugin.findById(pluginId);
  if (!plugin) {
    throw new Error('Plugin not found');
  }

  // Idempotency check: check if user already has an active or suspended license for this plugin
  const existingLicense = await License.findOne({
    ownerId,
    pluginId,
    status: { $in: [LICENSE_STATUS.ACTIVE, LICENSE_STATUS.SUSPENDED] },
  });

  if (existingLicense) {
    throw new Error('User already has an active or suspended license for this plugin.');
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
    sharedDetectionThreshold,
    expiresAt,
  });

  await AuditLog.log(AUDIT_ACTIONS.GENERATE, actorId, key, {
    pluginSlug: plugin.slug,
    ownerId,
    type,
    maxIps,
    expiresAt,
  });

  await cacheService.delete('stats:dashboard');

  log.info({ key: maskKey(key), ownerId }, 'License created successfully');
  return license;
}

/**
 * Synchronize and transition expired licenses to EXPIRED state in bulk.
 */
export async function syncExpiredLicenses(ownerId = null) {
  const query = {
    expiresAt: { $lt: new Date() },
    status: { $nin: [LICENSE_STATUS.EXPIRED, LICENSE_STATUS.REVOKED] },
  };
  if (ownerId) {
    query.ownerId = ownerId;
  }

  const expiredLicenses = await License.find(query);
  if (expiredLicenses.length > 0) {
    const expiredKeys = expiredLicenses.map((l) => l.key);

    // Bulk update status and clear activeCacheKeys in DB
    await License.updateMany(
      { key: { $in: expiredKeys } },
      { $set: { status: LICENSE_STATUS.EXPIRED, activeCacheKeys: [] } },
    );

    await cacheService.delete('stats:dashboard');

    // Bulk insert audit logs
    const auditLogsToCreate = expiredLicenses.map((license) => ({
      action: AUDIT_ACTIONS.EXPIRE,
      actorId: 'system',
      targetKey: license.key ? maskKey(license.key) : null,
      details: { reason: 'License expired' },
    }));

    if (auditLogsToCreate.length > 0) {
      await AuditLog.insertMany(auditLogsToCreate);
    }

    // Delete cache keys for all expired licenses
    for (const license of expiredLicenses) {
      if (license.activeCacheKeys && license.activeCacheKeys.length > 0) {
        for (const keyToDel of license.activeCacheKeys) {
          await cacheService.delete(keyToDel);
        }
      }
    }
  }
}

/**
 * Transition a single license to EXPIRED state, saving it and logging to audit.
 */
export async function expireIndividualLicense(license) {
  if (license.status !== LICENSE_STATUS.EXPIRED) {
    license.status = LICENSE_STATUS.EXPIRED;
    if (license.activeCacheKeys && license.activeCacheKeys.length > 0) {
      for (const keyToDel of license.activeCacheKeys) {
        await cacheService.delete(keyToDel);
      }
      license.activeCacheKeys = [];
    }
    await license.save();
    await cacheService.delete('stats:dashboard');
    await AuditLog.log(AUDIT_ACTIONS.EXPIRE, 'system', license.key, {
      reason: 'License expired',
    });
  }
}

/**
 * Validate a license during handshake.
 */
export async function validateLicense(params) {
  const hashedHwid = hashHwid(params.hwid);
  const cacheKey = `validate:${params.licenseKey}:${params.pluginId}:${params.serverIp}:${hashedHwid}`;

  // 1. Check cache first
  const cached = await cacheService.get(cacheKey);
  if (cached) {
    log.debug({ key: maskKey(params.licenseKey) }, 'License validation served from cache');
    return cached;
  }

  // Execute validation pipeline
  const result = await validateLicenseInternal(params, hashedHwid, cacheKey);

  // Log validation asynchronously
  logValidationToDiscord(params, result).catch((err) => {
    log.error({ err }, 'Failed to process Discord log notification');
  });

  return result;
}

async function validateLicenseInternal({ licenseKey, pluginId, serverIp }, hashedHwid, cacheKey) {
  // 2. Verify HMAC signature
  if (!verifyLicenseKey(licenseKey)) {
    log.warn({ key: maskKey(licenseKey) }, 'License key failed cryptographic signature check');
    return { valid: false, reason: 'Invalid license key signature' };
  }

  // 3. Check Blacklist (cached)
  const blacklistCacheKey = 'blacklist:all';
  let blacklistSet = await cacheService.get(blacklistCacheKey);
  if (!blacklistSet) {
    blacklistSet = await refreshBlacklistCache();
  }

  const isBlacklisted =
    blacklistSet.keys.includes(licenseKey) ||
    (hashedHwid && blacklistSet.hwids.includes(hashedHwid)) ||
    blacklistSet.ips.includes(serverIp);

  if (isBlacklisted) {
    log.warn(
      { key: maskKey(licenseKey), ip: serverIp },
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
  if (!license.pluginId || typeof license.pluginId !== 'object') {
    log.warn({ key: maskKey(licenseKey) }, 'License has no associated plugin');
    return { valid: false, reason: 'Associated plugin not found' };
  }

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
    await expireIndividualLicense(license);
    return { valid: false, reason: 'License has expired' };
  }

  // 7. Bind HWID on first use or verify match (atomic update)
  if (!license.hwid) {
    const hwidUpdatedLicense = await License.findOneAndUpdate(
      { _id: license._id, hwid: null },
      { $set: { hwid: hashedHwid, activatedAt: new Date() } },
      { new: true },
    );
    if (!hwidUpdatedLicense) {
      // Lost race to a concurrent request, fetch DB value
      const reFetched = await License.findById(license._id);
      if (!reFetched || reFetched.hwid !== hashedHwid) {
        log.warn(
          { key: maskKey(licenseKey), expected: reFetched?.hwid, got: hashedHwid },
          'HWID mismatch after concurrent binding attempt',
        );
        return { valid: false, reason: 'Hardware ID binding mismatch' };
      }
      license.hwid = reFetched.hwid;
      license.activatedAt = reFetched.activatedAt;
    } else {
      license.hwid = hashedHwid;
      license.activatedAt = hwidUpdatedLicense.activatedAt;
      log.info(
        { key: maskKey(licenseKey), hwid: hashedHwid },
        'License bound to HWID on first use',
      );
    }
  } else if (license.hwid !== hashedHwid) {
    log.warn(
      { key: maskKey(licenseKey), expected: license.hwid, got: hashedHwid },
      'HWID mismatch',
    );
    return { valid: false, reason: 'Hardware ID binding mismatch' };
  }

  // 8. Whitelist IP or check limit
  let isIpAllowed = license.allowedIps.includes(serverIp);
  let updatedLicense = null;

  if (!isIpAllowed) {
    if (license.allowedIps.length < license.maxIps) {
      // Room available, add it atomically
      updatedLicense = await License.findOneAndUpdate(
        {
          _id: license._id,
          [`allowedIps.${license.maxIps - 1}`]: { $exists: false },
        },
        { $addToSet: { allowedIps: serverIp } },
        { new: true },
      );
      if (updatedLicense) {
        license.allowedIps = updatedLicense.allowedIps;
        isIpAllowed = true;
        log.info({ key: maskKey(licenseKey), ip: serverIp }, 'New IP added to license whitelist');
      }
    } else if (license.hwid === hashedHwid) {
      // IP limit exceeded, but HWID matches (same machine, dynamic IP change). Auto-rotate oldest IP.
      const lastIpRotationAt = license.metadata?.get('lastIpRotationAt');
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (lastIpRotationAt && new Date(lastIpRotationAt) > oneHourAgo) {
        log.warn(
          { key: maskKey(licenseKey), lastIpRotationAt },
          'IP auto-rotation rate limited (max once per hour)'
        );
        return { valid: false, reason: 'IP auto-rotation limit exceeded. Please try again later.' };
      }

      const oldIps = [...license.allowedIps];
      const newIps = [...oldIps];
      newIps.shift(); // Remove oldest
      newIps.push(serverIp); // Add new

      updatedLicense = await License.findOneAndUpdate(
        { _id: license._id, hwid: hashedHwid },
        { $set: { allowedIps: newIps, 'metadata.lastIpRotationAt': new Date() } },
        { new: true },
      );
      if (updatedLicense) {
        license.allowedIps = updatedLicense.allowedIps;
        isIpAllowed = true;
        log.info(
          { key: maskKey(licenseKey), oldIps, newIps: license.allowedIps },
          'IP automatically rotated due to matching HWID',
        );
      }
    }
  }

  if (!isIpAllowed) {
    log.warn(
      { key: maskKey(licenseKey), count: license.allowedIps.length, max: license.maxIps },
      'IP limit exceeded during whitelist update',
    );
    return { valid: false, reason: 'Maximum IP limit exceeded' };
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
  license.markModified('metadata');

  const uniqueIps24h = new Set(validationIps.map((item) => item.ip)).size;
  const threshold = license.sharedDetectionThreshold ?? SHARED_DETECTION_THRESHOLD;
  if (uniqueIps24h > threshold) {
    license.status = LICENSE_STATUS.SUSPENDED;
    // Evict validation cache entries
    if (license.activeCacheKeys && license.activeCacheKeys.length > 0) {
      for (const keyToDel of license.activeCacheKeys) {
        await cacheService.delete(keyToDel);
      }
      license.activeCacheKeys = [];
    }
    await license.save();
    await cacheService.delete('stats:dashboard');

    await AuditLog.log(AUDIT_ACTIONS.SUSPEND, 'system', licenseKey, {
      reason: 'Shared license usage: unique IPs > threshold',
      uniqueIpsCount: uniqueIps24h,
    });

    log.warn({ key: maskKey(licenseKey), uniqueIps24h }, 'License suspended due to shared usage');
    return { valid: false, reason: 'Suspended: Shared license usage detected' };
  }

  // 10. Update validation timestamp and active cache keys
  license.lastValidatedAt = new Date();
  if (!license.activeCacheKeys) {
    license.activeCacheKeys = [];
  }
  if (!license.activeCacheKeys.includes(cacheKey)) {
    license.activeCacheKeys.push(cacheKey);
  }
  while (license.activeCacheKeys.length > 20) {
    license.activeCacheKeys.shift();
  }
  await license.save();

  // 11. Create signed token (JWT)
  const token = await signJwt({
    licenseId: license._id,
    pluginSlug: license.pluginId.slug,
    ownerId: license.ownerId,
    hwid: hashedHwid,
  });

  const result = {
    valid: true,
    token,
    discord: {
      ownerId: license.ownerId,
      ownerTag: license.ownerTag,
    },
  };

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

  // Clear active validation caches
  if (license.activeCacheKeys && license.activeCacheKeys.length > 0) {
    for (const keyToDel of license.activeCacheKeys) {
      await cacheService.delete(keyToDel);
    }
    license.activeCacheKeys = [];
  }

  await license.save();
  await cacheService.delete('stats:dashboard');

  await AuditLog.log(AUDIT_ACTIONS.REVOKE, actorId, key, { reason });

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

  // Clear active validation caches
  if (license.activeCacheKeys && license.activeCacheKeys.length > 0) {
    for (const keyToDel of license.activeCacheKeys) {
      await cacheService.delete(keyToDel);
    }
    license.activeCacheKeys = [];
  }

  await license.save();
  await cacheService.delete('stats:dashboard');

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

  // Clear active validation caches
  if (license.activeCacheKeys && license.activeCacheKeys.length > 0) {
    for (const keyToDel of license.activeCacheKeys) {
      await cacheService.delete(keyToDel);
    }
    license.activeCacheKeys = [];
  }

  await license.save();
  await cacheService.delete('stats:dashboard');

  await AuditLog.log(AUDIT_ACTIONS.SUSPEND, actorId, key, { reason });

  return license;
}

/**
 * Reactivate a suspended or expired license key.
 */
export async function reactivateLicense(key, actorId, reason = 'No reason provided') {
  log.info({ key: maskKey(key), actorId }, 'Reactivating license...');

  const license = await License.findOne({ key });
  if (!license) {
    throw new Error('License not found');
  }

  if (license.status === LICENSE_STATUS.ACTIVE) {
    throw new Error('License is already active');
  }

  if (license.status === LICENSE_STATUS.REVOKED) {
    throw new Error('Revoked licenses cannot be reactivated. Issue a new license instead.');
  }

  license.status = LICENSE_STATUS.ACTIVE;

  // Reset validation IPs rolling window tracker on reactivation
  if (license.metadata) {
    license.metadata.delete('validationIps');
  }

  // Clear active validation caches
  if (license.activeCacheKeys && license.activeCacheKeys.length > 0) {
    for (const keyToDel of license.activeCacheKeys) {
      await cacheService.delete(keyToDel);
    }
    license.activeCacheKeys = [];
  }

  await license.save();
  await cacheService.delete('stats:dashboard');

  await AuditLog.log(AUDIT_ACTIONS.REACTIVATE, actorId, key, { reason });

  log.info({ key: maskKey(key) }, 'License successfully reactivated');
  return license;
}

/**
 * List licenses with filters and pagination.
 */
export async function listLicenses({ ownerId, pluginId, status, page = 1, limit = 10 }) {
  // 2. Build pagination query
  const query = {};
  if (ownerId) query.ownerId = ownerId;
  if (pluginId) {
    if (!mongoose.Types.ObjectId.isValid(pluginId)) {
      throw new Error('Invalid plugin ID format');
    }
    query.pluginId = pluginId;
  }
  if (status) query.status = status;

  const total = await License.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const skip = (currentPage - 1) * limit;

  const licenses = await License.find(query)
    .populate('pluginId')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    licenses: licenses.map((l) => l.toObject()),
    total,
    page: currentPage,
    totalPages,
  };
}

/**
 * Get license details by full key.
 */
export async function getLicenseByKey(key) {
  const license = await License.findOne({ key }).populate('pluginId');
  if (license && license.expiresAt && new Date() > license.expiresAt) {
    await expireIndividualLicense(license);
  }
  return license ? license.toObject() : null;
}

/**
 * Get dashboard stats summaries.
 */
export async function getStats() {
  const cacheKey = 'stats:dashboard';
  const cached = await cacheService.get(cacheKey);
  if (cached) {
    return cached;
  }

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

  const result = {
    total,
    active,
    suspended,
    revoked,
    expired,
    types: typeBreakdown.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
    plugins: pluginBreakdown,
  };

  await cacheService.set(cacheKey, result, 60000); // 60s cache TTL
  return result;
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

  const ipRegex = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}$|^(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}$|^(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}$|^:(?::[0-9a-fA-F]{1,4}){1,7}$|^::$|^::ffff:(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  for (const ip of ips) {
    if (!ipRegex.test(ip)) {
      throw new Error(`Invalid IP address format: ${ip}`);
    }
  }

  const oldIps = [...license.allowedIps];

  const oldSet = new Set(oldIps);
  const newSet = new Set(ips);
  const ipsChanged = oldSet.size !== newSet.size || [...oldSet].some(ip => !newSet.has(ip));
  if (ipsChanged) {
    license.hwid = null;
    license.activatedAt = null;
    log.info({ key: maskKey(key) }, 'HWID lock reset due to whitelisted IPs list modification');
  }

  license.allowedIps = ips;

  // Clear active validation caches
  if (license.activeCacheKeys && license.activeCacheKeys.length > 0) {
    for (const keyToDel of license.activeCacheKeys) {
      await cacheService.delete(keyToDel);
    }
    license.activeCacheKeys = [];
  }

  await license.save();

  // Audit log
  await AuditLog.log(AUDIT_ACTIONS.UPDATE_IPS, actorId, key, {
    oldIps,
    newIps: ips,
    hwidReset: ipsChanged,
  });

  // Clear validation cache prefix if possible
  await cacheService.delete(`validate:${key}`);

  log.info({ key: maskKey(key), ownerId }, 'License IPs updated successfully');
  return license;
}

/**
 * Rebuild and cache the blacklist set from the database.
 */
export async function refreshBlacklistCache() {
  const list = await Blacklist.find().lean();
  const blacklistSet = {
    keys: list.filter((e) => e.type === BLACKLIST_TYPES.KEY).map((e) => e.value),
    hwids: list.filter((e) => e.type === BLACKLIST_TYPES.HWID).map((e) => e.value),
    ips: list.filter((e) => e.type === BLACKLIST_TYPES.IP).map((e) => e.value),
  };
  await cacheService.set('blacklist:all', blacklistSet, 60000); // 60s TTL
  return blacklistSet;
}

/**
 * Add an entity to the global blacklist and clear cache.
 */
export async function addBlacklist({ type, value, reason }, actorId) {
  log.info({ type, value, actorId }, 'Adding to blacklist...');
  const entry = await Blacklist.create({ type, value, reason, addedBy: actorId });

  // Clear specific validation cache if key is blocked
  if (type === BLACKLIST_TYPES.KEY) {
    const license = await License.findOne({ key: value });
    if (license && license.activeCacheKeys?.length > 0) {
      for (const keyToDel of license.activeCacheKeys) {
        await cacheService.delete(keyToDel);
      }
      license.activeCacheKeys = [];
      await license.save();
    }
  }
  // Proactively refresh blacklist cache set
  await refreshBlacklistCache();

  return entry;
}

/**
 * Remove an entity from the global blacklist and clear cache.
 */
export async function removeBlacklist({ type, value }, actorId) {
  log.info({ type, value, actorId }, 'Removing from blacklist...');
  const entry = await Blacklist.findOneAndDelete({ type, value });
  if (entry) {
    await refreshBlacklistCache();
  }
  return entry;
}
