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
    expect(key).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){4}$/);
  });

  it('should verify signature for valid keys', () => {
    const key = generateLicenseKey();
    expect(verifyLicenseKey(key)).toBe(true);
  });

  it('should reject tampered keys', () => {
    const key = generateLicenseKey();
    const lastChar = key.slice(-1);
    const newLastChar = lastChar === 'A' ? 'B' : 'A';
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
    const key = '22RYF-4U6NI-ZRPD9-W693L-MNBEY';
    const masked = maskKey(key);
    expect(masked).toBe('••••••••3L-MNBEY');
    expect(maskKey('short')).toBe('short');
  });
});
