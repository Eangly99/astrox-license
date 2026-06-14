# AstroX License Bot & API — Agent Documentation (AGENT.md)

This document details the architecture, cryptographic mechanics, security review findings, and operational directives for the **AstroX License** repository. It serves as a master blueprint for current developers and future agentic models interfacing with the codebase.

---

## 🕵️‍♂️ Agent Profile & Assessment Context

- **Assigned Operator**: Silas (Antigravity)
- **Role**: Senior Security Engineer / Threat Emulation Specialist (NSA TAO / DARPA consultant)
- **Engagement Context**: **Project Ironclad** (authorized red team security validation, anti-cheat signature testing, and threat infrastructure assessment under Mandiant audit contract).
- **Security Posture**: Clean implementation, minimal abstractions, production-ready rate-limiting, and timing-safe cryptographic checks.

---

## 🏗️ System Architecture & Codebase Map

AstroX License is a hybrid system containing a **Fastify REST API Handshake Server** (for Minecraft plugins or remote client handshakes) and a **Discord Bot Interface** (for administration and user self-service).

```
                      ┌──────────────────────────────────────┐
                      │             Discord Client           │
                      └──────────────────┬───────────────────┘
                                         │ (Slash / Interactions)
                                         ▼
┌──────────────────┐  HTTP POST  ┌───────────────┐               ┌───────────────┐
│ Minecraft Plugin ├────────────>│  Fastify API  │──────────────>│ Mongoose / DB │
└──────────────────┘             └───────┬───────┘               └───────────────┘
                                         │
                                         ▼
                                 ┌───────────────┐
                                 │ Redis / Cache │
                                 └───────────────┘
```

### 📂 Directory Structure

- `src/index.js`: Main bootstrap sequence, managing graceful startup and shutdown hooks (SIGINT, SIGTERM).
- `src/api/`: Fastify server configuration and routing handlers.
  - `server.js`: Connects Fastify, configures global IP rate-limits, registers routes.
  - `routes/validate.js`: Validation endpoint (`POST /api/v1/validate`) handling Zod parsing and handshake execution.
- `src/bot/`: Discord.js v14 client implementation.
  - `client.js`: Gateway client initialization with partials.
  - `handler.js`: Dynamic glob importer for events and commands.
  - `deploy-commands.js`: Deploy commands to Discord API.
  - `commands/`: Slash command modules (`admin.js`, `license.js`, `mylicense.js`).
  - `components/`: ActionRow component handlers (buttons, select menus).
- `src/db/`: MongoDB connection setup and Mongoose model definitions.
  - `connection.js`: Mongoose connector.
  - `models/`: Schemas for `License`, `Plugin`, `Blacklist`, and `AuditLog`.
- `src/services/`: Core logic layers.
  - `cryptoService.js`: HMAC key signatures, SHA256 hashing, and jose JWT routines.
  - `licenseService.js`: Main lifecycle commands (create, validate, revoke, transfer).
  - `cacheService.js`: Keyv integration (Redis or memory) for validation optimization.
- `src/utils/`: Formatters, standard configurations, constants, and validators.

---

## 🔑 Database Schema Reference

### 1. License Schema (`src/db/models/License.js`)

Stores license instances bound to plugins, owners, and hardware fingerprints.

- `key` (String, Index, Unique): Signed UUID key.
- `pluginId` (ObjectId ref 'Plugin'): The associated plugin.
- `ownerId` (String, Index): Discord user ID of the license owner.
- `ownerTag` (String): Discord tag of the owner.
- `type` (String enum): `trial`, `lifetime`, or `subscription`.
- `status` (String enum): `active`, `suspended`, `revoked`, or `expired`.
- `maxIps` (Number): Maximum concurrent whitelisted IPs allowed (default: 1).
- `allowedIps` (Array of Strings): Active whitelisted IP addresses.
- `hwid` (String): SHA-256 hardware fingerprint hash (null until first check).
- `expiresAt` (Date): Expired TTL index (auto-clears/transitions).
- `activatedAt` / `lastValidatedAt` (Date): Operational timestamps.
- `metadata` (Map): Extensible fields (e.g., tracking validation history).

### 2. Blacklist Schema (`src/db/models/Blacklist.js`)

Restricts access based on specific fields:

- `type` (String enum): `key`, `hwid`, or `ip`.
- `value` (String, Index): The identifier string.
- `reason` (String): Ban justification.
- `addedBy` (String): Operator Discord ID.

### 3. Plugin Schema (`src/db/models/Plugin.js`)

Plugin registration metadata:

- `name` (String) / `slug` (String, Unique, Index): Plugin identifiers.
- `version` (String) / `description` (String) / `iconUrl` (String).

### 4. Audit Log Schema (`src/db/models/AuditLog.js`)

System audit logging with a 90-day TTL retention index:

- `action` (String enum): Action executed.
- `actorId` (String): Account that executed the action (e.g., user ID or `'system'`).
- `targetKey` (String): _Masked_ license key target.
- `details` (Mixed): Payload metadata.
- `ip` (String): Server client IP.
- `timestamp` (Date, Index): Expire index set to `'90d'`.

---

## 🔒 Cryptographic & Security Mechanisms

### 1. License Signature Mechanics (`src/services/cryptoService.js`)

- **Key Generation**: Generates a standard UUID v4, computes an HMAC-SHA256 signature using `HMAC_SECRET`, slices the first 16 hex characters, and joins them: `${uuid}.${signature}`.
- **Signature Verification**: Splits the incoming key, rebuilds the expected signature from the UUID part, and verifies them using `crypto.timingSafeEqual`. This protects against timing attacks designed to guess signatures character-by-character.

### 2. Validation Token (JWT) & Discord Metadata

- Upon successful validation, the server generates a short-lived (60s) JWT signed with `HMAC_SECRET` using the HS256 algorithm. The token contains the `licenseId`, `pluginSlug`, `ownerId`, and hashed `hwid`. The Java plugin uses this token for short-lived session verification.
- The server also returns a `discord` object containing the `ownerId` and `ownerTag` of the license holder, enabling plugins to display registration ownership at startup or in logs.

### 3. Hardware Fingerprinting (HWID)

- The raw hardware ID (retrieved on client machine via OS tools, e.g., `wmic` on Windows or `/var/lib/dbus/machine-id` on Linux) is never sent or stored in plaintext. The client transmits it, and the API computes a SHA-256 hash (`hashHwid`) before database lookup or persistence.

### 4. Shared License Abuse Detection

- The system tracks client IPs that check in over a rolling 24-hour window using `validationIps` in the license metadata.
- If the unique IP count in the window exceeds `SHARED_DETECTION_THRESHOLD` (default: 3), the license status is immediately changed to `suspended` and logged to the audit system.

### 5. Obfuscated Responses

- The Fastify API does not disclose detailed validation failures to client handshakes. Any failure (blacklist, HWID mismatch, expired license, invalid signature) returns a generic `403 Forbidden` response:
  ```json
  {
    "status": "invalid",
    "error": "License validation failed"
  }
  ```
  This denies attackers target clues when probing the API.

---

## 🚀 Development, Testing, and linting

### Env Validation

At startup, `src/utils/config.js` validates environment parameters using Zod. The server immediately throws a fatal exception if mandatory keys (`BOT_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `ADMIN_ROLE_ID`, `MONGODB_URI`, `HMAC_SECRET`) are missing or if `HMAC_SECRET` is shorter than 32 characters.

### Run commands

- **Start production server**: `npm run start`
- **Start development watcher**: `npm run dev`
- **Deploy slash commands to Discord**: `npm run deploy`
- **Execute tests**: `npm run test` (uses Vitest)
- **Lint checking**: `npm run lint` / `npm run lint:fix` (uses ESLint 9+)
- **Code formatter**: `npm run format` (uses Prettier)

### Formatting & Parser Utilities

Core helper functions reside in [formatters.js](file:///f:/Projects/astrox-license/src/utils/formatters.js). Key modules include:

- `maskIpAddress(ip)`: Conceals the last octet of an IPv4 address (e.g. `192.168.1.xxx`) to protect PII in audits.
- `formatBytes(bytes)`: Translates memory stats into human-readable strings (e.g., MB, GB).
- `parseDuration(str)`: Flexibly converts human-readable duration strings (e.g., `12h`, `30m`, `3d`, `2w`) or presets into raw milliseconds.

---

## 🛡️ Hardening & Optimization Recommendations

1.  **Asymmetric Signing (Ed25519)**:
    - _Finding_: The system uses symmetric HMAC-SHA256. If a malicious client extracts the secret key, they can forge license keys.
    - _Harden_: Migrate to asymmetric cryptography (Ed25519). The bot retains the Private Key for license generation, while Java plugins only embed the Public Key to verify signed tokens locally, eliminating secret exposure.
2.  **Rate-Limit Optimization**:
    - _Finding_: Fastify rate limit uses memory-store by default. In multi-instance or serverless environments, this can be bypassed or leads to state inconsistency.
    - _Harden_: Configure the Fastify rate-limiter to use the Redis instance if `REDIS_URI` is provided.
3.  **Strict HWID Verification**:
    - _Finding_: Client HWID extraction can be mocked or faked easily by patching the Java integration library.
    - _Harden_: Implement secondary validation handshakes or payload signing from the client using JVM-native verification libraries.

---

## 🤖 Instructions for Future Agent Runs

When incoming agents receive a request to alter or update this codebase:

1.  **Strict Lint Rules**: Make sure changes do not break the ESLint/Prettier format check. Run `npm run lint` and `npm run format` before submitting edits.
2.  **Always Maintain Timing-Safety**: When comparing hashes or signatures, do not use `==` or `===`. Always leverage `crypto.timingSafeEqual` with matching buffer lengths.
3.  **Audit Trail Enforcement**: Every status modification or license creation must write to `AuditLog.log` using the appropriate `AUDIT_ACTIONS` enum.
4.  **No Plaintext Keys in Logs**: Ensure that `maskKey(key)` is applied before log prints or database logs to prevent leaking active license keys in logs.
5.  **Always Run Test Suite**: Verify changes using `npm test`. If changing model or validation schemas, update matching mock tests inside `tests/` directories.
