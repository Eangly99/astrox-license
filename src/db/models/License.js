import mongoose from 'mongoose';
import { LICENSE_TYPES, LICENSE_STATUS, SHARED_DETECTION_THRESHOLD } from '../../utils/constants.js';

const { Schema, model } = mongoose;

const licenseSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    pluginId: {
      type: Schema.Types.ObjectId,
      ref: 'Plugin',
      required: true,
      index: true,
    },
    ownerId: {
      type: String,
      required: true,
      index: true,
    },
    ownerTag: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(LICENSE_TYPES),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(LICENSE_STATUS),
      default: LICENSE_STATUS.ACTIVE,
      index: true,
    },
    maxIps: {
      type: Number,
      default: 1,
    },
    sharedDetectionThreshold: {
      type: Number,
      default: SHARED_DETECTION_THRESHOLD,
    },
    allowedIps: {
      type: [String],
      default: [],
    },
    hwid: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    lastValidatedAt: {
      type: Date,
      default: null,
    },
    activeCacheKeys: {
      type: [String],
      default: [],
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: () => new Map(),
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for fast queries by user and plugin
licenseSchema.index({ pluginId: 1, ownerId: 1 });

// Virtual to check if license is expired
licenseSchema.virtual('isExpired').get(function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

// Pre-save middleware to automatically transition status on expiry
licenseSchema.pre('save', function (next) {
  if (this.status !== LICENSE_STATUS.REVOKED && this.expiresAt && new Date() > this.expiresAt) {
    this.status = LICENSE_STATUS.EXPIRED;
  }
  next();
});

// Configure JSON serialization to include virtuals
licenseSchema.set('toJSON', { virtuals: true });
licenseSchema.set('toObject', { virtuals: true });

export default model('License', licenseSchema);
