import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const statsSnapshotSchema = new Schema(
  {
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    total: {
      type: Number,
      required: true,
    },
    active: {
      type: Number,
      required: true,
    },
    suspended: {
      type: Number,
      required: true,
    },
    revoked: {
      type: Number,
      required: true,
    },
    expired: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: false,
  },
);

export default model('StatsSnapshot', statsSnapshotSchema);
