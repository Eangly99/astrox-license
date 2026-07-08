# REST Validation API Documentation

AstroX License exposes a secure, high-performance REST validation endpoint managed by Fastify. This checkpoint is designed to verify license state, bind HWIDs, track IP whitelist boundaries, and block blacklisted targets.

---

## 📡 Validation Endpoint

- **Method**: `POST`
- **Route**: `/api/v1/validate`
- **Content-Type**: `application/json`
- **Rate Limiting**: 10 validation requests per minute per IP address.

### Request Body Parameters

The server expects a JSON payload containing the following properties:

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `licenseKey` | String | **Yes** | The full signed license key (`uuid.signature_prefix`). |
| `pluginId` | String | **Yes** | The unique registered plugin slug (e.g. `my-plugin-slug`). |
| `serverIp` | String | **Yes** | Client host IP address (IPv4 or IPv6 format). |
| `hwid` | String | **Yes** | Raw or hashed client system hardware fingerprint (min 8, max 128 characters). |
| `port` | Integer | No | Host server listening port (range 1–65535). |

---

## 🔒 Verification Order of Operations

Upon receiving a request, the server executes validation checks in this sequence:

```
[Incoming Request]
        │
        ▼
[1. Request Schema Validation]  ──(Failure)──>  [400 Bad Request]
        │
        ▼
[2. Global Blacklist Lookup]    ──(Match)────>  [403 Forbidden (Obfuscated)]
        │
        ▼
[3. Cryptographic Signature]    ──(Invalid)──>  [403 Forbidden (Obfuscated)]
        │
        ▼
[4. Mongoose DB License Lookup] ──(Not Found)─>  [403 Forbidden (Obfuscated)]
        │
        ▼
[5. HWID and Expiration Check]  ──(Failed)───>  [403 Forbidden (Obfuscated)]
        │
        ▼
[6. IP Whitelist Limits & Logs] ──(Over Limit)─> [403 Forbidden (Obfuscated)]
        │
        ▼
[7. Generate Session Token (JWT)]
        │
        ▼
[200 OK Response]
```

---

## 📋 Response Status Definitions

### 1. Success (200 OK)
Returned when all security checks pass. The response contains a short-lived (60s) validation token (JWT signed with HS256 using `HMAC_SECRET`) and Discord tags of the buyer.

```json
{
  "status": "valid",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...",
  "discord": {
    "ownerId": "182736455463728190",
    "ownerTag": "license_owner_username"
  }
}
```

### 2. Bad Request (400 Bad Request)
Returned when input parameters are missing, malformed (e.g., invalid IP address format), or exceed character limits.
```json
{
  "error": "Invalid request"
}
```

### 3. Verification Failed (403 Forbidden)
Returned when the license check is rejected for any security reason (e.g., license suspended/revoked, HWID mismatch, IP whitelisting limits exceeded, blacklisted status, or invalid key signature). 

> [!WARNING]
> To prevent crackers from analyzing key verification mechanisms or probing for valid inputs, **all validation rejections return this identical obfuscated response**.

```json
{
  "status": "invalid",
  "error": "License validation failed"
}
```

### 4. Rate Limited (429 Too Many Requests)
Returned when the client exceeds the configured rate limits (10 requests per minute per IP). The client should use its local JWT cache during this window.
```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded, retry in 42 seconds"
}
```

### 5. Internal Server Error (500 Internal Server Error)
Returned when an unexpected server error occurs during database operations or JWT generation.
```json
{
  "error": "Internal server error"
}
```
