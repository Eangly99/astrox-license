/** Brand color palette for embeds */
export const Colors = Object.freeze({
  /** Discord Blurple — info, default */
  PRIMARY: 0x5865f2,
  /** Green — success, license active */
  SUCCESS: 0x57f287,
  /** Yellow — warning, expiring soon */
  WARNING: 0xfee75c,
  /** Red — error, revoked, suspended */
  DANGER: 0xed4245,
  /** Dark grey — neutral, audit logs */
  NEUTRAL: 0x2f3136,
  /** White — clean state */
  WHITE: 0xffffff,
});

/** Map license status to embed color */
export const STATUS_COLORS = Object.freeze({
  active: Colors.SUCCESS,
  suspended: Colors.DANGER,
  revoked: Colors.DANGER,
  expired: Colors.WARNING,
});
