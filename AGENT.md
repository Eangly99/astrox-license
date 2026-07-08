# AstroX License Bot & API — Agent Master Integration Guide (AGENT.md)

This document acts as the definitive technical blueprint and operational guide for the **AstroX License** repository. It is designed to enable AI agents and developers to rapidly understand the system architecture, database schemas, cryptographic protections, validation workflows, and development guidelines.

---

## 🏗️ Architecture & Codebase Map

AstroX License combines a **Fastify REST API Handshake Server** (used by remote clients/plugins to validate licensing status) with a **Discord Bot Interface** (used by administrators to manage licenses and by users to view or self-manage their whitelisted IPs).

```
                      ┌──────────────────────────────────────┐
                      │             Discord Client           │
                      └──────────────────┬───────────────────┘
                                         │ (Slash Commands & Component Interactions)
                                         ▼
┌──────────────────┐  HTTP POST  ┌───────────────┐               ┌───────────────┐
│ Java Plugin/SDK  ├────────────>│  Fastify API  │──────────────>│ Mongoose DB   │
└──────────────────┘             └───────┬───────┘               └───────────────┘
                                         │
                                         ▼
                                 ┌───────────────┐
                                 │ Redis / Cache │
                                 └───────────────┘
```

### 📂 File Structure and Module Links

- [src/index.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/index.js): Entrypoint. Handles initialization, database connectivity, Fastify binding, and clean shutdown triggers (`SIGINT`, `SIGTERM`).
- [src/api/server.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/api/server.js): API server setup. Configures IP rate-limiting, registers routes, and boots Fastify.
- [src/api/routes/validate.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/api/routes/validate.js): Handshake endpoint (`POST /api/v1/validate`). Handles validation inputs via Zod/JSON-schema parsing.
- [src/bot/client.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/bot/client.js): Discord.js gateway client setup.
- [src/bot/handler.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/bot/handler.js): Event and command registration handler.
- [src/bot/commands/](file:///f:/Projects/astrox-license/astrox-license-bot/src/bot/commands/): Slash command controllers:
  - [license.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/bot/commands/license.js) (administrative license manipulation)
  - [mylicense.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/bot/commands/mylicense.js) (user self-management)
  - [admin.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/bot/commands/admin.js) (administrative configuration)
- [src/db/connection.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/db/connection.js): MongoDB connector.
- [src/db/models/](file:///f:/Projects/astrox-license/astrox-license-bot/src/db/models/): Mongoose Schemas:
  - [License.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/db/models/License.js) (license status, whitelisted IPs, HWID hashes, type, metadata)
  - [Plugin.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/db/models/Plugin.js) (registered plugin meta and slug identifiers)
  - [Blacklist.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/db/models/Blacklist.js) (banned keys, HWID hashes, or IP ranges)
  - [AuditLog.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/db/models/AuditLog.js) (operation audit logs with a 90-day TTL)
- [src/services/cryptoService.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/services/cryptoService.js): Central cryptographic module. Houses signature generation, signature checks, JWT signing/verifying, and HWID SHA-256 hashing.
- [src/services/signatureService.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/services/signatureService.js): Generates and caches an RSA keypair for asymmetric verification options.
- [src/services/licenseService.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/services/licenseService.js): Main operations orchestration (key generation, validation flow, IP checks, revocation).
- [src/services/cacheService.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/services/cacheService.js): Keyv storage integration (using Redis or falling back to in-memory).

---

## 🗃️ Database Schemas & Data Model Reference

### 1. License Schema ([License.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/db/models/License.js))
| Property | Type | Indexing | Purpose |
| :--- | :--- | :--- | :--- |
| `key` | String | Unique, Indexed | The cryptographic license key (`uuid.signature_prefix`). |
| `pluginId` | ObjectId | Indexed | Reference to the corresponding `Plugin` model. |
| `ownerId` | String | Indexed | Discord User ID of the buyer. |
| `ownerTag` | String | None | Discord User tag (e.g. `username`). |
| `type` | String | None | Enum: `trial`, `lifetime`, `subscription`. |
| `status` | String | None | Enum: `active`, `suspended`, `revoked`, `expired`. |
| `maxIps` | Number | None | Maximum allowed concurrent IP validations (default: 1). |
| `allowedIps`| Array[String]| None | Active whitelisted IPv4/IPv6 addresses bound to this license. |
| `hwid` | String | None | The SHA-256 hash of the client's raw hardware identifier. |
| `expiresAt` | Date | TTL Index | Expiration timestamp. MongoDB auto-removes/invalidates past this date. |
| `activatedAt`| Date | None | Timestamp of the first successful validation handshake. |
| `metadata` | Map | None | General logging store, tracks IP check-ins. |

### 2. Blacklist Schema ([Blacklist.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/db/models/Blacklist.js))
- Used to explicitly ban items.
- Fields:
  - `type` (String): Enum: `key`, `hwid`, `ip`.
  - `value` (String): Indexed string of the banned entity.
  - `reason` (String): Text explanation.
  - `addedBy` (String): Discord User ID of the staff member who applied the ban.

### 3. Plugin Schema ([Plugin.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/db/models/Plugin.js))
- Tracks registered Minecraft plugins.
- Fields:
  - `name` (String): Human-readable name.
  - `slug` (String): Unique, indexed URL-friendly slug matching the client identifier (e.g., `my-plugin`).
  - `version` (String): Current production version.
  - `description` (String): Descriptive text.

### 4. Audit Log Schema ([AuditLog.js](file:///f:/Projects/astrox-license/astrox-license-bot/src/db/models/AuditLog.js))
- Logs operations, indexed with a 90-day TTL to auto-prune stale records.
- Fields:
  - `action` (String): Enum representing the operation.
  - `actorId` (String): Account execution ID or `'system'`.
  - `targetKey` (String): Masked license key string (`*` padded).
  - `details` (Mixed): Arbitrary object data.
  - `ip` (String): Executing IP address.
  - `timestamp` (Date): Auto-purges after 90 days (`expires: '90d'`).

---

## 🔒 Cryptographic Handshake & Protection Mechanics

### 1. Symmetric Signature Generation
License keys are structured as `${uuid}.${signature}`.
1. A standard `UUID v4` is generated.
2. The UUID is signed with HMAC-SHA256 using `HMAC_SECRET`:
   $$\text{Signature} = \text{HMAC-SHA256}(\text{HMAC\_SECRET}, \text{UUID})$$
3. The first 16 hexadecimal characters of the signature are sliced and appended to the UUID.

### 2. Signature Validation & Timing-Safe Comparisons
When a client sends a license key to `/api/v1/validate`:
1. The server splits the incoming string by the `.` character.
2. It extracts the UUID and signature prefix.
3. It regenerates the signature from the UUID using the configured `HMAC_SECRET`.
4. It compares the extracted signature prefix with the newly generated signature prefix.
5. **Critical**: It performs the comparison using `crypto.timingSafeEqual(buf1, buf2)`. The server rejects the handshake immediately if the lengths or contents differ, preventing timing attacks.

### 3. Verification Token (Short-lived JWT)
Once the signature, HWID, IP whitelist, and status checks pass:
1. The server issues a short-lived (60s) JSON Web Token (JWT).
2. The JWT is signed with the `HMAC_SECRET` using the HS256 algorithm.
3. Payload parameters:
   - `licenseId`: ID of the license in the database.
   - `pluginSlug`: The unique plugin slug.
   - `ownerId`: Discord ID of the buyer.
   - `hwid`: SHA-256 hash of the HWID.
4. Remote clients cache this token locally. For subsequent checks within the 60-second window, the client uses the cached JWT without reaching out to the validation endpoint, avoiding rate-limiting.

### 4. Hardware Fingerprinting (HWID)
- The client extracts system hardware parameters (e.g., CPU identifier, system UUID).
- The raw hardware ID is never sent or stored in plaintext.
- The client sends the string, and the server converts it into a `SHA-256` hash immediately before making database queries or lookups.

### 5. Shared License Abuse Detection
- The system prevents license sharing by logging validation IPs in a rolling 24-hour window inside the license metadata.
- If the unique IP count in this rolling 24-hour window exceeds the threshold (default: 3), the license status changes automatically to `suspended` and audits the incident.

### 6. Obfuscated Responses
- To restrict information leakage, the API does not return detail-rich rejection reasons to the client.
- Whether the failure is due to a blacklisted IP, a mismatched HWID, an expired trial, or an invalid HMAC signature, the server responds with a generic `403 Forbidden` response:
  ```json
  {
    "status": "invalid",
    "error": "License validation failed"
  }
  ```

---

## 🤖 Instructions for AI Agents & Model Runs

If you are an AI model or developer tasked with making edits or modifications to this codebase, you **must** adhere to the following conventions:

1. **Maintain Timing Safety**: Never use `==` or `===` when comparing cryptographic hashes, signatures, or keys. Always use `crypto.timingSafeEqual` with Buffers of equal length.
2. **Strict Lint and Code Styling**: Run `npm run lint` and `npm run format` prior to committing changes. Code must strictly compile under ESLint 9+ guidelines and match Prettier rules.
3. **Audit Trails**: Every administrative change, status transition (e.g. suspension, revocation, generation), or blacklist addition must create an entry in the database using the `AuditLog` model.
4. **Key Masking**: Never write full license keys to logs, standard output, or metadata fields. Always use the `maskKey(key)` utility function before printing or logging.
5. **No Sandbox Escapes**: Ensure all dependencies are managed correctly through `pnpm-workspace.yaml`. Do not introduce bloated custom libraries when Node.js native packages (like `node:crypto`) can fulfill the task.
6. **Maintain Test Suite Integrity**: Run `npm test` after modifying logic. Ensure unit tests in the `/tests` folder are updated to mirror modifications made to models or route handlers.
