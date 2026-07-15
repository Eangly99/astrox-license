import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../utils/config.js';
import { JWT } from '../utils/constants.js';

const secretKey = new TextEncoder().encode(config.HMAC_SECRET);

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Extracts 50 bits from the HMAC-SHA256 signature and maps it to a 10-character Base32 string.
 * @param {string} payload
 * @param {string} secret
 * @returns {string}
 */
function getSignatureChars(payload, secret) {
  const hash = crypto.createHmac('sha256', secret).update(payload).digest();
  let sig = '';
  let bitAccumulator = 0;
  let bitCount = 0;
  let byteIndex = 0;

  for (let i = 0; i < 10; i++) {
    while (bitCount < 5 && byteIndex < hash.length) {
      bitAccumulator = (bitAccumulator << 8) | hash[byteIndex];
      bitCount += 8;
      byteIndex++;
    }
    const index = (bitAccumulator >> (bitCount - 5)) & 31;
    bitCount -= 5;
    sig += CHARSET[index];
  }
  return sig;
}

/**
 * Generate an HMAC-signed license key.
 * Format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
 * @returns {string}
 */
export function generateLicenseKey() {
  let payload = '';
  for (let i = 0; i < 15; i++) {
    payload += CHARSET[crypto.randomInt(CHARSET.length)];
  }

  const signature = getSignatureChars(payload, config.HMAC_SECRET);
  const fullKey = payload + signature;

  return fullKey.match(/.{1,5}/g).join('-');
}

/**
 * Timing-safe verification of a license key signature.
 * @param {string} key
 * @returns {boolean}
 */
export function verifyLicenseKey(key) {
  if (!key || typeof key !== 'string') return false;

  const cleanKey = key.replace(/-/g, '').toUpperCase();
  if (cleanKey.length !== 25) return false;

  for (const char of cleanKey) {
    if (CHARSET.indexOf(char) === -1) return false;
  }

  const payload = cleanKey.slice(0, 15);
  const signature = cleanKey.slice(15);

  const expectedSignature = getSignatureChars(payload, config.HMAC_SECRET);

  const sigBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (sigBuffer.length !== expectedBuffer.length) return false;

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
