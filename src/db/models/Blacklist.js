import mongoose from 'mongoose';
import { BLACKLIST_TYPES } from '../../utils/constants.js';

const { Schema, model } = mongoose;

const blacklistSchema = new Schema(
  {
    type: {
      type: String,
      enum: Object.values(BLACKLIST_TYPES),
      required: true,
    },
    value: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      maxlength: 500,
    },
    addedBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Prevent duplicate blacklist entries of the same type/value
blacklistSchema.index({ type: 1, value: 1 }, { unique: true });

export default model('Blacklist', blacklistSchema);
