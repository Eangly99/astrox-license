import { STATUS_BADGES, DURATION_PRESETS } from './constants.js';

/**
 * Format milliseconds into a human-readable duration string.
 * @param {number} ms
 * @returns {string} e.g. "30d 12h 5m"
 */
export function formatDuration(ms) {
  if (!ms || ms <= 0) return 'Lifetime';

  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(' ') || '< 1m';
}

/**
 * Format a Date into a Discord full timestamp.
 * @param {Date} date
 * @returns {string} e.g. "<t:1234567890:f>"
 */
export function formatDate(date) {
  if (!date) return 'N/A';
  const unix = Math.floor(new Date(date).getTime() / 1000);
  return `<t:${unix}:f>`;
}

/**
 * Format a Date into a Discord relative timestamp.
 * @param {Date} date
 * @returns {string} e.g. "<t:1234567890:R>"
 */
export function formatRelative(date) {
  if (!date) return 'N/A';
  const unix = Math.floor(new Date(date).getTime() / 1000);
  return `<t:${unix}:R>`;
}

/**
 * Mask a license key, showing only the last 8 characters.
 * @param {string} key
 * @returns {string} e.g. "••••••••a1b2c3d4"
 */
export function maskKey(key) {
  if (!key || key.length <= 8) return key || 'N/A';
  return `${'•'.repeat(8)}${key.slice(-8)}`;
}

/**
 * Get the status badge emoji + label.
 * @param {string} status
 * @returns {string} e.g. "✅ Active"
 */
export function statusBadge(status) {
  const emoji = STATUS_BADGES[status] || '❓';
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  return `${emoji} ${label}`;
}

/**
 * Truncate a string to a max length with ellipsis.
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
export function truncate(str, max = 100) {
  if (!str) return '';
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

/**
 * Format an IP list for embed display.
 * @param {string[]} ips
 * @param {number} max
 * @returns {string}
 */
export function formatIpList(ips, max) {
  if (!ips || ips.length === 0) return 'None bound';
  return `${ips.join(', ')} (${ips.length}/${max})`;
}

/**
 * Mask an IP address for privacy, concealing the last block of digits.
 * @param {string} ip
 * @returns {string} e.g. "192.168.1.xxx" or "N/A"
 */
export function maskIpAddress(ip) {
  if (!ip || typeof ip !== 'string') return 'N/A';
  const parts = ip.split('.');
  if (parts.length !== 4) return ip; // Fallback for IPv6 or malformed
  return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
}

/**
 * Format raw bytes into a human-readable size string.
 * @param {number} bytes
 * @param {number} decimals
 * @returns {string} e.g. "1.25 MB"
 */
export function formatBytes(bytes, decimals = 2) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Parse a human duration string into milliseconds.
 * Supports: s (seconds), m (minutes), h (hours), d (days), w (weeks).
 * @param {string} str
 * @returns {number|null} milliseconds or null if invalid
 */
export function parseDuration(str) {
  if (!str) return null;
  const cleaned = str.trim().toLowerCase();

  // Check DURATION_PRESETS first
  const preset = DURATION_PRESETS[cleaned];
  if (preset) return preset;

  const match = cleaned.match(/^(\d+)([smhdw])$/);
  if (!match) {
    const rawNum = parseInt(cleaned, 10);
    return !isNaN(rawNum) && rawNum > 0 ? rawNum : null;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    case 'w':
      return value * 7 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}
