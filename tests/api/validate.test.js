import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/db/connection.js';
import Plugin from '../../src/db/models/Plugin.js';
import License from '../../src/db/models/License.js';
import { createLicense } from '../../src/services/licenseService.js';
import { fastify, startApi, stopApi } from '../../src/api/server.js';

describe('API Route Validation Tests', () => {
  let mockPlugin;
  let activeLicense;

  beforeAll(async () => {
    // 1. DB Connect
    await connectDatabase();

    // 2. Clear collections
    await Plugin.deleteMany({});
    await License.deleteMany({});

    // 3. Create mock plugin
    mockPlugin = await Plugin.create({
      name: 'API Test Plugin',
      slug: 'api-plugin',
      version: '1.0.0',
      createdBy: '12345',
    });

    // 4. Create mock active license
    activeLicense = await createLicense(
      {
        pluginId: mockPlugin._id.toString(),
        ownerId: '54321',
        ownerTag: 'ApiOwner#1111',
        type: 'lifetime',
        maxIps: 1,
      },
      'system',
    );

    // 5. Initialize API server plugins/routes (awaits init Promise)
    await startApi();
  });

  afterAll(async () => {
    // Shutdown REST API server
    await stopApi();

    // Clean DB
    await Plugin.deleteMany({});
    await License.deleteMany({});
    await disconnectDatabase();
  });

  it('should validate active license successfully (200 OK)', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/v1/validate',
      payload: {
        licenseKey: activeLicense.key,
        pluginId: 'api-plugin',
        serverIp: '1.1.1.1',
        hwid: 'hwid_first_api_test',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('valid');
    expect(body.token).toBeTypeOf('string');
  });

  it('should return 403 Forbidden for invalid key signatures', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/v1/validate',
      payload: {
        licenseKey: 'invalid-key-signature.123',
        pluginId: 'api-plugin',
        serverIp: '1.1.1.1',
        hwid: 'hwid_api_test',
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('invalid');
    expect(body.error).toBe('License validation failed'); // Monolithic obfuscated error message
  });

  it('should return 400 Bad Request for malformed request payloads', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/v1/validate',
      payload: {
        licenseKey: '', // Missing key
        pluginId: 'api-plugin',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Invalid request');
  });
});
