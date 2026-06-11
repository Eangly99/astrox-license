# AstroX License

A production-grade, high-performance Discord bot and REST API for managing, verifying, and distributing licenses for Minecraft plugins (Spigot/Paper). Built using Node.js (v25+) and Discord.js v14.

---

## 🏗️ System Architecture

```
[Minecraft Plugin]
       │ (POST /api/v1/validate)
       ▼
 ┌───────────┐         ┌────────────────────────┐
 │ Fastify   │ ──────> │  licenseService.js     │
 │ REST API  │ <────── │  (Crypto validation)   │
 └───────────┘         └────────────────────────┘
                                   │
 ┌───────────┐                     ├───> [ MongoDB (Mongoose) ]
 │ Discord   │ ──(Interactions)──> │
 │ Bot Client│                     └───> [ Cache (Keyv / Redis) ]
 └───────────┘
```

---

## 🔑 Core Features

1. **Cryptographic License Keys**: Keys are standard UUID v4 signed with HMAC-SHA256 signatures, preventing license key forging.
2. **HWID Binding**: Licenses are locked to a server hardware fingerprint (SHA-256 hash) on the first validation handshake.
3. **IP Whitelisting**: Allows configuring the maximum allowed unique IPs per license (default: 1).
4. **Shared License Detection**: Automatically suspends licenses that perform validation handshakes from more than 3 unique IPs in 24 hours.
5. **Global Blacklist**: Admin console to blacklist specific keys, IPs, or HWIDs.
6. **Graceful Lifecycles**: Fully handles SIGTERM and SIGINT signals, ensuring connections to Fastify, MongoDB, and Discord are drained properly before shutdown.

---

## 🗂️ Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
BOT_TOKEN=                  # Discord Bot Token (from developer portal)
CLIENT_ID=                  # Discord Application/Client ID
GUILD_ID=                   # Discord Server (Guild) ID for testing commands
ADMIN_ROLE_ID=              # Role ID allowed to run administrator commands
MONGODB_URI=                # MongoDB connection string (e.g. mongodb://127.0.0.1:27017/astrox-license)
REDIS_URI=                  # Redis connection string (optional - falls back to memory cache)
HMAC_SECRET=                # Min 32 character 256-bit secret for HMAC key generation
API_PORT=3000               # Port for the Fastify REST API handshake server
NODE_ENV=production
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v25.0.0+)
- MongoDB (Running locally or hosted)
- Redis (Optional, for cross-instance caching)
- pnpm (`npm install -g pnpm`)

### Setup and Running

1. Clone this repository.
2. Install dependencies:
   ```bash
   pnpm install --frozen-lockfile
   ```
3. Create a `.env` file containing your environment configurations.
4. Deploy the application's slash commands to Discord:
   ```bash
   pnpm run deploy
   ```
5. Launch the application:
   ```bash
   pnpm start
   ```

---

## 📂 Command Reference

### Licensing Commands (All Users / Moderation)

- `/license generate <plugin> <user> <type> [duration] [max-ips]` — Generates a new license key (trial, lifetime, subscription).
- `/license verify <key>` — Look up details of a license key. Includes a `Check Status` button.
- `/license list [user] [plugin] [status]` — Returns a paginated listing of matching licenses.
- `/license transfer <key> <new-owner>` — Transfers ownership, resetting HWID and whitelisted IPs.
- `/license revoke <key> [reason]` — Revokes a license key (requires confirmation).

### Administration Commands

- `/stats` — Dashboard displaying system counts, type breakdowns, and plugin usage.
- `/blacklist <add|remove|list>` — Block or unblock licenses, IPs, or HWIDs.
- `/audit [user] [action]` — View system action history (expires after 90 days).
- `/plugin <add|update|remove|list>` — Register and manage plugins.

---

## 🔌 API Reference (Minecraft Handshake)

### Validate License

- **Endpoint**: `POST /api/v1/validate`
- **Rate Limit**: 10 requests / minute per IP

#### Request Payload

```json
{
  "licenseKey": "a1b2c3d4-e5f6-7890-abcd-ef1234567890.1a2b3c4d5e6f7g8h",
  "pluginId": "my-plugin",
  "serverIp": "192.168.1.100",
  "hwid": "my-server-hardware-hash-fingerprint"
}
```

#### Response (Success - 200 OK)

Returns a short-lived (60s) JWT signed using the `HMAC_SECRET`.

```json
{
  "status": "valid",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey..."
}
```

#### Response (Rejected - 403 Forbidden)

```json
{
  "status": "invalid",
  "error": "License validation failed"
}
```

---

## 🐳 Pterodactyl Deployment

This system is pre-configured for deployment on Pterodactyl Panel. We provide a full, importable egg configuration:

1. Import `egg-astrox-license.json` into your Pterodactyl Panel under the Nests tab.
2. Create a server using the newly imported **AstroX License Bot** egg.
3. Configure the environment variables directly within the Pterodactyl Panel settings UI (under Startup settings).
4. Pterodactyl will automatically parse and write these values to the local `.env` configuration on server startup.
