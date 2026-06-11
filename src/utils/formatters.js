import { STATUS_BADGES } from './constants.js';

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
