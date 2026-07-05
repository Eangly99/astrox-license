import mongoose from 'mongoose';
import { AUDIT_ACTIONS } from '../../utils/constants.js';
import { maskKey } from '../../utils/formatters.js';

const { Schema, model } = mongoose;

const auditLogSchema = new Schema({
  action: {
    type: String,
    enum: Object.values(AUDIT_ACTIONS),
    required: true,
  },
  actorId: {
    type: String,
    required: true,
    index: true,
  },
  targetKey: {
    type: String,
    default: null,
    index: true,
  },
  details: {
    type: Schema.Types.Mixed,
    default: {},
  },
  ip: {
    type: String,
    default: null,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: { expires: '90d' }, // Expires after 90 days
  },
});

// Static helper to quickly record log entries
auditLogSchema.statics.log = async function (action, actorId, targetKey, details = {}, ip = null) {
  const maskedKey = targetKey ? maskKey(targetKey) : null;
  return this.create({
    action,
    actorId,
    targetKey: maskedKey,
    details,
    ip,
  });
};

export default model('AuditLog', auditLogSchema);
