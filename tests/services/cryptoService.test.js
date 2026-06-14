import { describe, it, expect } from 'vitest';
import {
  generateLicenseKey,
  verifyLicenseKey,
  signJwt,
  verifyJwt,
  hashHwid,
} from '../../src/services/cryptoService.js';
import { maskKey } from '../../src/utils/formatters.js';

describe('Crypto Service Tests', () => {
  it('should generate valid license keys', () => {
    const key = generateLicenseKey();
    expect(key).toBeTypeOf('string');
    expect(key.split('.')).toHaveLength(2);
    expect(key.split('.')[1]).toHaveLength(16); // Signature slice prefix
  });

  it('should verify signature for valid keys', () => {
    const key = generateLicenseKey();
    expect(verifyLicenseKey(key)).toBe(true);
  });

  it('should reject tampered keys', () => {
    const key = generateLicenseKey();
    const lastChar = key.slice(-1);
    const newLastChar = lastChar === 'a' ? 'b' : 'a';
    const tampered = `${key.slice(0, -1)}${newLastChar}`;
    expect(verifyLicenseKey(tampered)).toBe(false);
    expect(verifyLicenseKey('invalid-key')).toBe(false);
  });

  it('should sign and verify JWT tokens', async () => {
    const payload = { sub: 'test-subject', admin: true };
    const token = await signJwt(payload);
    expect(token).toBeTypeOf('string');

    const decoded = await verifyJwt(token);
    expect(decoded.sub).toBe('test-subject');
    expect(decoded.admin).toBe(true);
  });

  it('should generate deterministic HWID hashes', () => {
    const raw = 'my-hardware-id-12345';
    const hash1 = hashHwid(raw);
    const hash2 = hashHwid(raw);

    expect(hash1).toHaveLength(64); // SHA-256 hex length
    expect(hash1).toBe(hash2);
    expect(hashHwid(null)).toBeNull();
  });

  it('should mask license keys securely', () => {
    const key = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.abcdef0123456789';
    const masked = maskKey(key);
    expect(masked).toBe('••••••••23456789');
    expect(maskKey('short')).toBe('short');
  });
});
