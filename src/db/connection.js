import mongoose from 'mongoose';
import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('mongodb');

// Register Mongoose connection event listeners for diagnostic visibility
mongoose.connection.on('connected', () => {
  log.info('Mongoose connection status: Connected');
});
mongoose.connection.on('error', (err) => {
  log.error({ err }, 'Mongoose connection status: Error');
});
mongoose.connection.on('disconnected', () => {
  log.warn('Mongoose connection status: Disconnected');
});
mongoose.connection.on('reconnected', () => {
  log.info('Mongoose connection status: Reconnected');
});

export async function connectDatabase() {
  const uri = config.MONGODB_URI;
  const safeUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
  
  const maxAttempts = config.NODE_ENV === 'test' ? 2 : 5;
  const delayMs = config.NODE_ENV === 'test' ? 100 : 5000;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    log.info({ uri: safeUri, attempt, maxAttempts }, 'Connecting to MongoDB...');
    try {
      await mongoose.connect(uri, {
        autoIndex: config.NODE_ENV !== 'production',
        serverSelectionTimeoutMS: config.NODE_ENV === 'test' ? 2000 : 5000,
      });
      log.info('MongoDB connected successfully');
      return;
    } catch (error) {
      log.error({ err: error, attempt }, `MongoDB connection attempt ${attempt} failed`);
      if (attempt >= maxAttempts) {
        throw error;
      }
      log.info(`Waiting ${delayMs / 1000}s before next connection attempt...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function disconnectDatabase() {
  log.info('Disconnecting from MongoDB...');
  try {
    await mongoose.disconnect();
    log.info('MongoDB disconnected');
  } catch (error) {
    log.error({ err: error }, 'Failed to disconnect from MongoDB');
  }
}
