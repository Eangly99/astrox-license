// NOTE: Keep in sync with dashboard constants in astrox-license-dash/src/lib/constants.ts
/** License types */
export const LICENSE_TYPES = Object.freeze({
  TRIAL: 'trial',
  LIFETIME: 'lifetime',
  SUBSCRIPTION: 'subscription',
});

/** License statuses */
export const LICENSE_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
});

/** Audit log actions */
export const AUDIT_ACTIONS = Object.freeze({
  GENERATE: 'generate',
  VERIFY: 'verify',
  REVOKE: 'revoke',
  TRANSFER: 'transfer',
  SUSPEND: 'suspend',
  REACTIVATE: 'reactivate',
  BLACKLIST_ADD: 'blacklist_add',
  BLACKLIST_REMOVE: 'blacklist_remove',
  UPDATE_IPS: 'update_ips',
  EXPIRE: 'expire',
});

/** Blacklist entry types */
export const BLACKLIST_TYPES = Object.freeze({
  KEY: 'key',
  HWID: 'hwid',
  IP: 'ip',
});

/** Rate limiting */
export const RATE_LIMITS = Object.freeze({
  API_MAX: 10,
  API_WINDOW: '1 minute',
  COMMAND_COOLDOWN_SECONDS: 5,
});

/** Pagination */
export const PAGINATION = Object.freeze({
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 25,
});

/** Cache TTLs (milliseconds) */
export const CACHE_TTL = Object.freeze({
  LICENSE_VALIDATION: 60_000,
  PLUGIN_LIST: 300_000,
});

/** JWT settings */
export const JWT = Object.freeze({
  ISSUER: 'astrox-license',
  AUDIENCE: 'minecraft-plugin',
  EXPIRY: '60s',
});

/** Default shared detection threshold */
export const SHARED_DETECTION_THRESHOLD = 3;

/** Shared detection window (24 hours in ms) */
export const SHARED_DETECTION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Default max IPs per license */
export const DEFAULT_MAX_IPS = 1;

/** Duration presets (in milliseconds) */
export const DURATION_PRESETS = Object.freeze({
  '1d': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
  '90d': 7_776_000_000,
  '365d': 31_536_000_000,
});

/** Status emoji badges */
export const STATUS_BADGES = Object.freeze({
  active: '✅',
  suspended: '🔒',
  revoked: '❌',
  expired: '⏳',
});
