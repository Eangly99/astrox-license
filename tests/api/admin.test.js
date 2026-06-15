import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SignJWT } from 'jose';
import { connectDatabase, disconnectDatabase } from '../../src/db/connection.js';
import { config } from '../../src/utils/config.js';
import Plugin from '../../src/db/models/Plugin.js';
import License from '../../src/db/models/License.js';
import Blacklist from '../../src/db/models/Blacklist.js';
import AuditLog from '../../src/db/models/AuditLog.js';
import { createLicense } from '../../src/services/licenseService.js';
import { fastify, startApi, stopApi } from '../../src/api/server.js';

const secretKey = new TextEncoder().encode(config.HMAC_SECRET);

async function generateAdminToken(userId = '123456789012345678') {
  return await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('astrox-license')
    .setAudience('astrox-license-admin')
    .setExpirationTime('5m')
    .sign(secretKey);
}

async function generateInvalidToken(userId = '123456789012345678') {
  return await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('wrong-issuer')
    .setAudience('astrox-license-admin')
    .setExpirationTime('5m')
    .sign(secretKey);
}

describe('Admin API Route Tests', () => {
  let mockPlugin;
  let testLicense;
  let adminToken;
  let unauthorizedToken;

  beforeAll(async () => {
    // 1. DB Connect
    await connectDatabase();

    // 2. Clear collections
    await Plugin.deleteMany({});
    await License.deleteMany({});
    await Blacklist.deleteMany({});
    await AuditLog.deleteMany({});

    // 3. Create mock plugin
    mockPlugin = await Plugin.create({
      name: 'Admin Test Plugin',
      slug: 'admin-plugin',
      version: '1.0.0',
      createdBy: '12345',
    });

    // 4. Create mock active license
    testLicense = await createLicense(
      {
        pluginId: mockPlugin._id.toString(),
        ownerId: '54321',
        ownerTag: 'LicenseOwner#1111',
        type: 'lifetime',
        maxIps: 1,
      },
      'system',
    );

    // 5. Generate mock JWTs
    adminToken = await generateAdminToken('123456789012345678'); // Configured in .env.test
    unauthorizedToken = await generateAdminToken('999999999999999999'); // Not an admin ID

    // 6. Initialize API server
    await startApi();
  });

  afterAll(async () => {
    await stopApi();
    await Plugin.deleteMany({});
    await License.deleteMany({});
    await Blacklist.deleteMany({});
    await AuditLog.deleteMany({});
    await disconnectDatabase();
  });

  describe('Security & Authentication', () => {
    it('should block requests with missing Authorization header (401)', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/v1/admin/stats',
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toContain('Unauthorized');
    });

    it('should block requests with invalid JWT tokens (401)', async () => {
      const badToken = await generateInvalidToken();
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/v1/admin/stats',
        headers: { authorization: `Bearer ${badToken}` },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toContain('Unauthorized');
    });

    it('should block non-admin Discord IDs (403)', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/v1/admin/stats',
        headers: { authorization: `Bearer ${unauthorizedToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error).toContain('Forbidden');
    });

    it('should allow authorized admin Discord IDs (200)', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/v1/admin/stats',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Stats Dashboard Endpoint', () => {
    it('should return system statistics aggregates and recent logs', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/v1/admin/stats',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.total).toBe(1);
      expect(data.active).toBe(1);
      expect(data.deltas).toBeDefined();
      expect(data.recentLogs).toBeInstanceOf(Array);
      expect(data.plugins).toBeInstanceOf(Array);
      expect(data.plugins[0].slug).toBe('admin-plugin');
    });
  });

  describe('License Management Endpoints', () => {
    it('should list licenses with pagination', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/v1/admin/licenses?page=1&limit=10',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.licenses).toBeInstanceOf(Array);
      expect(data.licenses.length).toBe(1);
      expect(data.total).toBe(1);
    });

    it('should create a new license', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/admin/licenses',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          pluginId: mockPlugin._id.toString(),
          ownerId: '98765',
          ownerTag: 'NewOwner#9999',
          type: 'lifetime',
          maxIps: 3,
        },
      });
      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.key).toBeDefined();
      expect(data.ownerId).toBe('98765');
      expect(data.maxIps).toBe(3);
    });

    it('should fetch single license details and masked logs', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: `/api/v1/admin/licenses/${testLicense.key}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.license).toBeDefined();
      expect(data.license.key).toBe(testLicense.key);
      expect(data.auditLogs).toBeInstanceOf(Array);
    });

    it('should suspend and reactivate a license', async () => {
      // 1. Suspend
      const suspendRes = await fastify.inject({
        method: 'POST',
        url: `/api/v1/admin/licenses/${testLicense.key}/suspend`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: 'Violation detected' },
      });
      expect(suspendRes.statusCode).toBe(200);
      expect(JSON.parse(suspendRes.body).status).toBe('suspended');

      // 2. Reactivate
      const reactivateRes = await fastify.inject({
        method: 'POST',
        url: `/api/v1/admin/licenses/${testLicense.key}/reactivate`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: 'Issue resolved' },
      });
      expect(reactivateRes.statusCode).toBe(200);
      expect(JSON.parse(reactivateRes.body).status).toBe('active');
    });

    it('should transfer ownership of a license', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: `/api/v1/admin/licenses/${testLicense.key}/transfer`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ownerId: '11111', ownerTag: 'Transferred#0000' },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.ownerId).toBe('11111');
      expect(data.ownerTag).toBe('Transferred#0000');
      expect(data.hwid).toBeNull();
      expect(data.allowedIps.length).toBe(0);
    });

    it('should reset whitelisted IPs', async () => {
      const res = await fastify.inject({
        method: 'PUT',
        url: `/api/v1/admin/licenses/${testLicense.key}/ips`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ips: ['192.168.1.1'] },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.allowedIps).toContain('192.168.1.1');
    });

    it('should reset HWID lock', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: `/api/v1/admin/licenses/${testLicense.key}/hwid-reset`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.hwid).toBeNull();
    });
  });

  describe('Plugin Registry Endpoints', () => {
    it('should list all registered plugins', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/v1/admin/plugins',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data).toBeInstanceOf(Array);
      expect(data.some((p) => p.slug === 'admin-plugin')).toBe(true);
    });

    it('should register a new plugin', async () => {
      const res = await fastify.inject({
        method: 'POST',
        url: '/api/v1/admin/plugins',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'New Test Plugin',
          slug: 'new-plugin',
          version: '1.2.3',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).slug).toBe('new-plugin');
    });
  });

  describe('Blacklist Management Endpoints', () => {
    it('should add to blacklist, fetch it, and remove it', async () => {
      // 1. Add
      const addRes = await fastify.inject({
        method: 'POST',
        url: '/api/v1/admin/blacklist',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          type: 'ip',
          value: '8.8.8.8',
          reason: 'Abuse activity',
        },
      });
      expect(addRes.statusCode).toBe(201);

      // 2. Fetch list
      const listRes = await fastify.inject({
        method: 'GET',
        url: '/api/v1/admin/blacklist?type=ip',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(listRes.statusCode).toBe(200);
      const data = JSON.parse(listRes.body);
      expect(data.some((b) => b.value === '8.8.8.8')).toBe(true);

      // 3. Remove
      const delRes = await fastify.inject({
        method: 'DELETE',
        url: '/api/v1/admin/blacklist?type=ip&value=8.8.8.8',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(delRes.statusCode).toBe(200);
      expect(JSON.parse(delRes.body).success).toBe(true);
    });
  });

  describe('Audit Log Ledger Endpoints', () => {
    it('should retrieve audit logs with filters and pagination', async () => {
      const res = await fastify.inject({
        method: 'GET',
        url: '/api/v1/admin/audit?page=1&limit=5',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.logs).toBeInstanceOf(Array);
      expect(data.total).toBeGreaterThan(0);
    });
  });
});
