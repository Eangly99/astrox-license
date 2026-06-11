import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/db/connection.js';
import Plugin from '../../src/db/models/Plugin.js';
import License from '../../src/db/models/License.js';
import Blacklist from '../../src/db/models/Blacklist.js';
import AuditLog from '../../src/db/models/AuditLog.js';
import {
  createLicense,
  validateLicense,
  transferLicense,
  updateLicenseIps,
} from '../../src/services/licenseService.js';

describe('License Service Integration Tests', () => {
  let mockPlugin;

  beforeAll(async () => {
    // Connect to test DB
    await connectDatabase();

    // Clear collections
    await Plugin.deleteMany({});
    await License.deleteMany({});
    await Blacklist.deleteMany({});
    await AuditLog.deleteMany({});

    // Create mock plugin
    mockPlugin = await Plugin.create({
      name: 'Test Plugin',
      slug: 'test-plugin',
      version: '1.0.0',
      description: 'UnitTest plugin target',
      createdBy: '123456789',
    });
  });

  afterAll(async () => {
    await Plugin.deleteMany({});
    await License.deleteMany({});
    await Blacklist.deleteMany({});
    await AuditLog.deleteMany({});
    await disconnectDatabase();
  });

  it('should create a license key successfully', async () => {
    const lic = await createLicense(
      {
        pluginId: mockPlugin._id.toString(),
        ownerId: '987654321',
        ownerTag: 'Owner#0000',
        type: 'trial',
        duration: '86400000', // 1d
        maxIps: 2,
      },
      'admin_user_id',
    );

    expect(lic).toBeDefined();
    expect(lic.key).toBeTypeOf('string');
    expect(lic.status).toBe('active');
    expect(lic.maxIps).toBe(2);
  });

  it('should pass validation for a healthy license key', async () => {
    const lic = await createLicense(
      {
        pluginId: mockPlugin._id.toString(),
        ownerId: '987654321',
        ownerTag: 'Owner#0000',
        type: 'lifetime',
        maxIps: 2,
      },
      'admin_user_id',
    );

    const check = await validateLicense({
      licenseKey: lic.key,
      pluginId: 'test-plugin',
      serverIp: '127.0.0.1',
      hwid: 'hwid_first_use_string',
    });

    expect(check.valid).toBe(true);
    expect(check.token).toBeTypeOf('string');

    // Confirm HWID lock is bound
    const updated = await License.findById(lic._id).lean();
    expect(updated.hwid).not.toBeNull();
  });

  it('should reject validation if HWID mismatch occurs', async () => {
    const lic = await createLicense(
      {
        pluginId: mockPlugin._id.toString(),
        ownerId: '987654321',
        ownerTag: 'Owner#0000',
        type: 'lifetime',
        maxIps: 2,
      },
      'admin_user_id',
    );

    // Bind first
    await validateLicense({
      licenseKey: lic.key,
      pluginId: 'test-plugin',
      serverIp: '127.0.0.1',
      hwid: 'original_hwid',
    });

    // Attempt second validation with new HWID
    const check = await validateLicense({
      licenseKey: lic.key,
      pluginId: 'test-plugin',
      serverIp: '127.0.0.1',
      hwid: 'malicious_hwid',
    });

    expect(check.valid).toBe(false);
    expect(check.reason).toContain('Hardware ID binding mismatch');
  });

  it('should reject validation if IP limit exceeded', async () => {
    const lic = await createLicense(
      {
        pluginId: mockPlugin._id.toString(),
        ownerId: '987654321',
        ownerTag: 'Owner#0000',
        type: 'lifetime',
        maxIps: 1, // Only 1 IP allowed
      },
      'admin_user_id',
    );

    // Validate first IP (Success)
    const check1 = await validateLicense({
      licenseKey: lic.key,
      pluginId: 'test-plugin',
      serverIp: '192.168.1.1',
      hwid: 'original_hwid',
    });
    expect(check1.valid).toBe(true);

    // Validate second IP (Fails IP quota)
    const check2 = await validateLicense({
      licenseKey: lic.key,
      pluginId: 'test-plugin',
      serverIp: '192.168.1.2',
      hwid: 'original_hwid',
    });
    expect(check2.valid).toBe(false);
    expect(check2.reason).toContain('IP limit exceeded');
  });

  it('should suspend license if shared validation exceeds threshold', async () => {
    const lic = await createLicense(
      {
        pluginId: mockPlugin._id.toString(),
        ownerId: '987654321',
        ownerTag: 'Owner#0000',
        type: 'lifetime',
        maxIps: 5,
      },
      'admin_user_id',
    );

    // Shared validation from 4 different IPs (threshold is 3 unique IPs in 24h)
    const ips = ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4'];

    // IP 1: Success
    const c1 = await validateLicense({
      licenseKey: lic.key,
      pluginId: 'test-plugin',
      serverIp: ips[0],
      hwid: 'shared_hwid',
    });
    expect(c1.valid).toBe(true);

    // IP 2: Success
    const c2 = await validateLicense({
      licenseKey: lic.key,
      pluginId: 'test-plugin',
      serverIp: ips[1],
      hwid: 'shared_hwid',
    });
    expect(c2.valid).toBe(true);

    // IP 3: Success
    const c3 = await validateLicense({
      licenseKey: lic.key,
      pluginId: 'test-plugin',
      serverIp: ips[2],
      hwid: 'shared_hwid',
    });
    expect(c3.valid).toBe(true);

    // IP 4: Exceeds threshold of unique IPs -> Trigger suspension
    const c4 = await validateLicense({
      licenseKey: lic.key,
      pluginId: 'test-plugin',
      serverIp: ips[3],
      hwid: 'shared_hwid',
    });
    expect(c4.valid).toBe(false);

    // Check status in DB
    const checkStatus = await License.findById(lic._id).lean();
    expect(checkStatus.status).toBe('suspended');
  });

  it('should transfer ownership and reset bindings', async () => {
    const lic = await createLicense(
      {
        pluginId: mockPlugin._id.toString(),
        ownerId: '111',
        ownerTag: 'First#0000',
        type: 'lifetime',
        maxIps: 1,
      },
      'admin_user_id',
    );

    // Bind first
    await validateLicense({
      licenseKey: lic.key,
      pluginId: 'test-plugin',
      serverIp: '127.0.0.1',
      hwid: 'hwid_old',
    });

    // Transfer
    const transferred = await transferLicense(lic.key, '222', 'Second#0000', 'admin_user_id');
    expect(transferred.ownerId).toBe('222');
    expect(transferred.hwid).toBeNull();
    expect(transferred.allowedIps).toHaveLength(0);
  });

  it('should update whitelisted IPs successfully', async () => {
    const lic = await createLicense(
      {
        pluginId: mockPlugin._id.toString(),
        ownerId: 'my_user_id',
        ownerTag: 'Me#1234',
        type: 'lifetime',
        maxIps: 3,
      },
      'admin_user_id',
    );

    // Update with valid IPs under limit
    const updated = await updateLicenseIps(
      lic.key,
      'my_user_id',
      ['192.168.1.1', '10.0.0.1'],
      'my_user_id',
    );
    expect(updated.allowedIps).toEqual(['192.168.1.1', '10.0.0.1']);

    // Should fail with too many IPs
    await expect(
      updateLicenseIps(
        lic.key,
        'my_user_id',
        ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4'],
        'my_user_id',
      ),
    ).rejects.toThrow('IP limit exceeded');

    // Should fail with invalid IP format
    await expect(
      updateLicenseIps(lic.key, 'my_user_id', ['not-an-ip'], 'my_user_id'),
    ).rejects.toThrow('Invalid IPv4 address format');

    // Should fail if not the owner
    await expect(
      updateLicenseIps(lic.key, 'someone_else', ['1.1.1.1'], 'someone_else'),
    ).rejects.toThrow('License not found');
  });
});
