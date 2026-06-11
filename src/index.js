import { config } from './utils/config.js'; // Validates variables at load
import { logger } from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './db/connection.js';
import { loadCommands, loadEvents } from './bot/handler.js';
import { client } from './bot/client.js';
import { startApi, stopApi } from './api/server.js';

logger.info(
  {
    node: process.version,
    env: config.NODE_ENV,
    port: config.API_PORT,
  },
  'Initializing AstroX License System...',
);

let isShuttingDown = false;

async function bootstrap() {
  try {
    // 1. Core Persistence
    await connectDatabase();

    // 2. Load Discord Bot assets
    await loadCommands(client);
    await loadEvents(client);

    // 3. Start Fastify REST API
    await startApi();

    // 4. Authenticate Discord Client
    logger.info('Authenticating with Discord Gateway...');
    await client.login(config.BOT_TOKEN);
  } catch (error) {
    logger.fatal({ err: error }, 'Bootstrap sequence failed. System aborting.');
    process.exit(1);
  }
}

// Graceful shutdown sequence
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Graceful shutdown signal received. Terminating processes...');

  try {
    // Destroy bot session first to stop processing gateway events
    if (client && client.isReady()) {
      logger.info('Destroying Discord client session...');
      client.destroy();
    }

    // Stop API to stop accepting incoming handshake requests
    await stopApi();

    // Disconnect DB
    await disconnectDatabase();

    logger.info('AstroX License shut down successfully.');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Exception encountered during shutdown lifecycle');
    process.exit(1);
  }
}

// Process signal monitoring
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Promise Rejection detected');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught Exception detected. Shutting down...');
  shutdown('UNCAUGHT_EXCEPTION');
});

// Run bootstrap
bootstrap();
