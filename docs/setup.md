# Setup & Deployment

Deploy Cipher License on your VPS, hosting node, or directly inside Pterodactyl Panel using Node.js v23+.

## Prerequisites

- **Node.js**: Version 23.0.0 or higher
- **Database**: MongoDB (Local instance or Atlas cloud cluster)
- **Caching**: Keyv (In-memory default or Redis cache sharing)
- **Package Manager**: pnpm or npm

## Environment Configuration

Configure environment variables by cloning the template file:

```bash
cp .env.example .env
```

Edit the generated `.env` file to supply your Discord Bot Token, Mongo Connection URI, and other required variables:

```ini
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/cipher-license
BOT_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here
GUILD_ID=your_discord_guild_id_here
```

## Slash Command Registration

Command schemas must be registered to the Discord Gateway before boot:

```bash
npm run deploy
```

## Starting the Service

Launch the main daemon script using npm:

```bash
npm start
```

