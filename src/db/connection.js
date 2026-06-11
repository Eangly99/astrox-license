import mongoose from 'mongoose';
import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('mongodb');

export async function connectDatabase() {
  const uri = config.MONGODB_URI;
  log.info({ uri }, 'Connecting to MongoDB...');

  try {
    await mongoose.connect(uri, {
      autoIndex: true,
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
