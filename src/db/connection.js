import mongoose from 'mongoose';
import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('mongodb');

export async function connectDatabase() {
  const uri = config.MONGODB_URI;
  const safeUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
  log.info({ uri: safeUri }, 'Connecting to MongoDB...');

  try {
    await mongoose.connect(uri, {
      autoIndex: config.NODE_ENV !== 'production',
      serverSelectionTimeoutMS: 5000,
    });
    log.info('MongoDB connected successfully');
  } catch (error) {
    log.error({ err: error }, 'MongoDB connection failed');
    throw error;
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
