# REST Validation API

Validation requests are managed by Fastify. Exposes a single validation handshake endpoint.

## Endpoint Structure

```http
POST /api/v1/validate
```

### Request Headers

```http
Content-Type: application/json
User-Agent: AstroXLicense-Handshake-Java
```

### Request Body (JSON)

```json
{
  "licenseKey": "a1b2c3d4-e5f6-7890-abcd-ef1234567890.1a2b3c4d5e6f7g8h",
  "pluginId": "my-plugin",
  "serverIp": "192.168.1.100",
  "hwid": "my-server-hardware-hash-fingerprint"
}
```

### Response (Success - 200 OK)

Returns validation token (JWT expires in 60s) allowing local verification cache, along with the Discord details of the license owner.

```json
{
  "status": "valid",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...",
  "discord": {
    "ownerId": "123456789012345678",
    "ownerTag": "username"
  }
}
```

### Response (Rejected - 403 Forbidden)

Returns an obfuscated generic error to prevent verification signature analysis.

```json
{
  "status": "invalid",
  "error": "License validation failed"
}
```
