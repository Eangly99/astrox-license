import StatsSnapshot from '../db/models/StatsSnapshot.js';
import { createLogger } from './logger.js';

const logger = createLogger('scheduler');

let expiryInterval = null;
let snapshotInterval = null;

export function startScheduler() {
  logger.info('Starting background scheduler...');

  // 1. Expiry sync: run every 5 minutes (300,000 ms)
  expiryInterval = setInterval(async () => {
    try {
      logger.debug('Running background expired licenses sync...');
      const { syncExpiredLicenses } = await import('../services/licenseService.js');
      await syncExpiredLicenses();
    } catch (err) {
      logger.error({ err }, 'Error in background expired licenses sync');
    }
  }, 300000);

  // 2. Stats snapshot: run every hour (3,600,000 ms) to keep snapshots fresh
  snapshotInterval = setInterval(async () => {
    try {
      logger.debug('Generating stats snapshot...');
      const { getStats } = await import('../services/licenseService.js');
      const stats = await getStats();
      await StatsSnapshot.create({
        timestamp: new Date(),
        total: stats.total,
        active: stats.active,
        suspended: stats.suspended,
        revoked: stats.revoked,
        expired: stats.expired,
      });
    } catch (err) {
      logger.error({ err }, 'Error generating stats snapshot');
    }
  }, 3600000);

  // Also run initial snapshot immediately on startup if there is no snapshot within the last hour
  setTimeout(async () => {
    try {
      const oneHourAgo = new Date(Date.now() - 3600000);
      const recentSnapshot = await StatsSnapshot.findOne({ timestamp: { $gte: oneHourAgo } });
      if (!recentSnapshot) {
        logger.info('No recent stats snapshot found. Generating initial snapshot...');
        const { getStats } = await import('../services/licenseService.js');
        const stats = await getStats();
        await StatsSnapshot.create({
          timestamp: new Date(),
          total: stats.total,
          active: stats.active,
          suspended: stats.suspended,
          revoked: stats.revoked,
          expired: stats.expired,
        });
      }
    } catch (err) {
      logger.error({ err }, 'Error in initial stats snapshot check');
    }
  }, 5000);
}

export function stopScheduler() {
  logger.info('Stopping background scheduler...');
  if (expiryInterval) {
    clearInterval(expiryInterval);
    expiryInterval = null;
  }
  if (snapshotInterval) {
    clearInterval(snapshotInterval);
    snapshotInterval = null;
  }
}
