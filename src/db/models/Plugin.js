import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const pluginSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 32,
      index: true,
    },
    version: {
      type: String,
      default: '1.0.0',
      trim: true,
    },
    description: {
      type: String,
      default: '',
      maxlength: 256,
    },
    iconUrl: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export default model('Plugin', pluginSchema);
