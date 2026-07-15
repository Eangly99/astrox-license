/** Brand color palette for embeds */
export const Colors = Object.freeze({
  /** Vibrant Purple — info, primary, default */
  PRIMARY: 0x7C3AED,
  /** Emerald Green — success, license active */
  SUCCESS: 0x10B981,
  /** Amber Yellow — warning, expiring soon */
  WARNING: 0xF59E0B,
  /** Crimson Red — error, revoked, suspended */
  DANGER: 0xEF4444,
  /** Zinc Dark Gray — neutral, audit logs */
  NEUTRAL: 0x3F3F46,
  /** White — clean state */
  WHITE: 0xFFFFFF,
});

/** Map license status to embed color */
export const STATUS_COLORS = Object.freeze({
  active: Colors.SUCCESS,
  suspended: Colors.DANGER,
  revoked: Colors.DANGER,
  expired: Colors.WARNING,
});
