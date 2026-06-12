import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatDate,
  formatRelative,
  maskKey,
  statusBadge,
  truncate,
  formatIpList,
  maskIpAddress,
  formatBytes,
  parseDuration,
} from '../../src/utils/formatters.js';

describe('formatters utility module', () => {
  describe('formatDuration', () => {
    it('should format milliseconds into readable durations', () => {
      expect(formatDuration(0)).toBe('Lifetime');
      expect(formatDuration(-100)).toBe('Lifetime');
      expect(formatDuration(60000)).toBe('1m');
      expect(formatDuration(3600000)).toBe('1h');
      expect(formatDuration(86400000)).toBe('1d');
      expect(formatDuration(90060000)).toBe('1d 1h 1m');
    });
  });

  describe('formatDate', () => {
    it('should handle null / undefined dates', () => {
      expect(formatDate(null)).toBe('N/A');
    });

    it('should convert date to Discord timestamp', () => {
      const d = new Date(1700000000000); // 2023-11-14T22:13:20.000Z
      expect(formatDate(d)).toBe('<t:1700000000:f>');
    });
  });

  describe('formatRelative', () => {
    it('should convert date to relative Discord timestamp', () => {
      const d = new Date(1700000000000);
      expect(formatRelative(d)).toBe('<t:1700000000:R>');
    });
  });

  describe('maskKey', () => {
    it('should mask license keys', () => {
      expect(maskKey(null)).toBe('N/A');
      expect(maskKey('short')).toBe('short');
      expect(maskKey('my-long-license-key-12345678')).toBe('••••••••12345678');
    });
  });

  describe('statusBadge', () => {
    it('should return correct badge for status', () => {
      expect(statusBadge('active')).toBe('✅ Active');
      expect(statusBadge('suspended')).toBe('🔒 Suspended');
      expect(statusBadge('revoked')).toBe('❌ Revoked');
      expect(statusBadge('expired')).toBe('⏳ Expired');
      expect(statusBadge('unknown_status')).toBe('❓ Unknown_status');
    });
  });

  describe('truncate', () => {
    it('should truncate strings', () => {
      expect(truncate('', 10)).toBe('');
      expect(truncate('hello world', 15)).toBe('hello world');
      expect(truncate('hello world', 5)).toBe('hell…');
    });
  });

  describe('formatIpList', () => {
    it('should format lists of IPs', () => {
      expect(formatIpList([], 3)).toBe('None bound');
      expect(formatIpList(['1.1.1.1', '2.2.2.2'], 3)).toBe('1.1.1.1, 2.2.2.2 (2/3)');
    });
  });

  describe('maskIpAddress', () => {
    it('should conceal the last octet of IPv4 addresses', () => {
      expect(maskIpAddress(null)).toBe('N/A');
      expect(maskIpAddress('192.168.1.100')).toBe('192.168.1.xxx');
      expect(maskIpAddress('8.8.8.8')).toBe('8.8.8.xxx');
      expect(maskIpAddress('::1')).toBe('::1'); // Fallback for IPv6
    });
  });

  describe('formatBytes', () => {
    it('should format bytes to human readable sizes', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(512)).toBe('512 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
    });
  });

  describe('parseDuration', () => {
    it('should parse duration strings into milliseconds', () => {
      expect(parseDuration(null)).toBeNull();
      expect(parseDuration('invalid')).toBeNull();
      expect(parseDuration('30s')).toBe(30 * 1000);
      expect(parseDuration('5m')).toBe(5 * 60 * 1000);
      expect(parseDuration('2h')).toBe(2 * 60 * 60 * 1000);
      expect(parseDuration('3d')).toBe(3 * 24 * 60 * 60 * 1000);
      expect(parseDuration('1w')).toBe(7 * 24 * 60 * 60 * 1000);
      expect(parseDuration('30d')).toBe(30 * 24 * 60 * 60 * 1000); // Preset check
      expect(parseDuration('86400000')).toBe(86400000); // Raw number check
    });
  });
});
