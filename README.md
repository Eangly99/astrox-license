# Cipher License (Bot & REST API)

A high-performance, secure license management suite built with **Node.js (v23+)** and **Discord.js v14**. Cipher License allows plugin developers to securely generate, verify, and monitor licenses for Minecraft plugins (Spigot/Paper) with zero friction.

---

## 🏗️ Architecture Overview

The system runs a **Fastify REST API server** for remote client validation handshakes alongside a **Discord Bot Client** for client/admin interactions and self-service panel commands.

```
                    ┌────────────────────────────┐
                    │       Discord Client       │
                    └─────────────┬──────────────┘
                                  │ (Slash / Interactions)
                                  ▼
┌──────────────────┐  HTTP POST  ┌───────────────┐     ┌───────────────┐
│ Java Plugin/SDK  ├────────────>│  Fastify API  ├────>│ MongoDB DB    │
└──────────────────┘             └───────┬───────┘     └───────────────┘
                                         │
                                         ▼
                                 ┌───────────────┐
                                 │ Redis / Cache │
                                 └───────────────┘
```

---

## 🔑 Core Features

- **Cryptographic Keys**: License keys are generated as HMAC-SHA256 signatures of a secure UUID, protecting against brute-forcing and forging attempts.
- **HWID Machine Lock**: Binds client licenses dynamically to the server's unique hardware fingerprint (SHA-256 hashed) during the initial handshake.
- **IP Whitelisting & Self-Management**: Supports whitelisting a configurable limit of concurrent IPs (default: 1) and lets users update their IPs via `/mylicense`.
- **Shared License Abuse Prevention**: Suspends license keys automatically if they perform handshakes from more than 3 unique IP addresses within a rolling 24-hour window.
- **Timing-Safe Checks & Obfuscation**: Uses `crypto.timingSafeEqual` for validation, and returns generic obfuscated `403 Forbidden` responses for all validation failures.
- **Audit Trails**: Logs all key generations, transfers, revocations, and system actions in a collection with a 90-day automatic retention index (TTL).
- **Graceful Shutdown**: Properly intercepts `SIGTERM` and `SIGINT` signals, closing Fastify and database connection pools without losing in-flight validations.

---

## ⚙️ Configuration (.env)

Duplicate `.env.example` to `.env` and populate the required parameters:

```env
# Discord Connection Configs
BOT_TOKEN=your_bot_token_here
CLIENT_ID=your_discord_application_id
GUILD_ID=your_target_discord_server_id
ADMIN_ROLE_ID=authorized_admin_role_id

# Database & Cache URIs
MONGODB_URI=mongodb://127.0.0.1:27017/cipher-license
REDIS_URI=mongodb_or_redis_caching_endpoint   # Optional: falls back to Memory Cache

# Cryptographic Keys (Min 32 characters)
HMAC_SECRET=your_super_secret_signing_key_32_chars_long

# Web Host Settings
API_PORT=3000
NODE_ENV=production
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v23.0.0+)
- MongoDB (Running locally or hosted Atlas cluster)
- Redis (Optional, for cluster environments)
- pnpm (Recommended: `npm i -g pnpm`)

### Setup Commands
1. **Install Dependencies**:
   ```bash
   pnpm install --frozen-lockfile
   ```
2. **Register Slash Commands**:
   ```bash
   pnpm run deploy
   ```
3. **Start in Production Mode**:
   ```bash
   pnpm start
   ```
4. **Start in Watch/Development Mode**:
   ```bash
   pnpm run dev
   ```

---

## 📂 Interaction Suite Reference

### Admin/Staff Suite (`/license` & `/admin`)
- `/license generate <plugin> <user> <type> [duration] [max-ips]` — Generates a signed license key.
- `/license verify <key>` — Checks details, owners, and bindings of a license.
- `/license list [user] [plugin] [status]` — Returns a paginated search list.
- `/license transfer <key> <new-owner>` — Transfers key ownership, resetting whitelists and HWID locks.
- `/license revoke <key> [reason]` — Revokes and deactivates a license key.
- `/admin stats` — Displays database metrics and active plugin summaries.
- `/admin blacklist <add|remove|list>` — Globally blocks specific IPs, HWIDs, or license keys.
- `/admin audit [user] [action]` — Accesses the 90-day operations logs.
- `/admin plugin <add|update|remove|list>` — Registers and configures plugin profiles.

### User Self-Service Suite (`/mylicense`)
- `/mylicense` — Lists owned licenses and allows whitelisting current server IPs dynamically.

---

## 🔌 API Handshake Specifications

### Validation Checkpoint
- **Route**: `POST /api/v1/validate`
- **Rate Limit**: 10 requests/minute per client IP (using Fastify-Rate-Limit)

#### Request Payload
```json
{
  "licenseKey": "e1a90c9b-640a-4fb4-87be-a5e22709e1e2.f3a5e8d9c2b1a0e4",
  "pluginId": "custom-plugin-slug",
  "serverIp": "198.51.100.42",
  "hwid": "00000000-0000-0000-0000-000000000000"
}
```

#### Successful Verification Response (200 OK)
Returns a 60-second valid JWT signed with the gateway's `HMAC_SECRET` and buyer tags.
```json
{
  "status": "valid",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...",
  "discord": {
    "ownerId": "858203948576932847",
    "ownerTag": "buyer_username"
  }
}
```

#### Rejected Response (403 Forbidden)
```json
{
  "status": "invalid",
  "error": "License validation failed"
}
```
*Note: Any failure is obfuscated into a generic message to block probing.*

---

## 🐳 Pterodactyl Panel Deployment

Cipher License includes an importable egg definition for Pterodactyl Panel:
1. Go to your Pterodactyl Admin Area -> **Nests** -> Import Egg.
2. Select [egg-cipher-license.json](file:///f:/Projects/cipher-license/cipher-bot/egg-cipher-license.json).
3. Create a server using the imported **Cipher License Bot** Egg.
4. Set environment parameters via the **Startup** settings in the server dashboard. Pterodactyl automatically formats and saves these configurations into your `.env` configuration file on startup.

