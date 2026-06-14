import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../utils/config.js';
import { JWT } from '../utils/constants.js';

const secretKey = new TextEncoder().encode(config.HMAC_SECRET);

/**
 * Generate an HMAC-signed license key.
 * Format: UUID.signature_prefix (first 16 hex chars)
 * @returns {string}
 */
export function generateLicenseKey() {
  const uuid = crypto.randomUUID();
  const signature = crypto
    .createHmac('sha256', config.HMAC_SECRET)
    .update(uuid)
    .digest('hex')
    .slice(0, 16);

  return `${uuid}.${signature}`;
}

/**
 * Timing-safe verification of a license key signature.
 * @param {string} key
 * @returns {boolean}
 */
export function verifyLicenseKey(key) {
  if (!key || typeof key !== 'string') return false;

  const parts = key.split('.');
  if (parts.length !== 2) return false;

  const [uuid, signature] = parts;
  if (!uuid || !signature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', config.HMAC_SECRET)
    .update(uuid)
    .digest('hex')
    .slice(0, 16);

  if (signature.length !== expectedSignature.length) return false;

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Sign a short-lived token (JWT) using HS256.
 * @param {object} payload
 * @returns {Promise<string>}
 */
export async function signJwt(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT.ISSUER)
    .setAudience(JWT.AUDIENCE)
    .setExpirationTime(JWT.EXPIRY)
    .sign(secretKey);
}

/**
 * Verify and decode a short-lived JWT.
 * @param {string} token
 * @returns {Promise<object>}
 */
export async function verifyJwt(token) {
  const { payload } = await jwtVerify(token, secretKey, {
    issuer: JWT.ISSUER,
    audience: JWT.AUDIENCE,
    algorithms: ['HS256'],
  });
  return payload;
}

/**
 * Generate a SHA256 hex hash of a hardware fingerprint.
 * @param {string} rawHwid
 * @returns {string}
 */
export function hashHwid(rawHwid) {
  if (!rawHwid) return null;
  return crypto.createHash('sha256').update(rawHwid).digest('hex');
}
