import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../utils/logger.js';

const log = createLogger('signature-service');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.join(__dirname, '../../keys');
const privateKeyPath = path.join(keysDir, 'private_key.pem');
const publicKeyPath = path.join(keysDir, 'public_key.pem');

let privateKey = null;
let publicKey = null;

export function initKeys() {
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    log.info('RSA keypair not found. Generating new 2048-bit RSA keypair...');
    const { privateKey: priv, publicKey: pub } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });
    fs.writeFileSync(privateKeyPath, priv);
    fs.writeFileSync(publicKeyPath, pub);
    log.info(`RSA keypair generated and saved to ${keysDir}`);
  }

  privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  publicKey = fs.readFileSync(publicKeyPath, 'utf8');
}

/**
 * Sign string data using the RSA Private Key.
 * @param {string} data
 * @returns {string} Base64 signature
 */
export function signData(data) {
  if (!privateKey) {
    initKeys();
  }
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  return sign.sign(privateKey, 'base64');
}

export function getPublicKey() {
  if (!publicKey) {
    initKeys();
  }
  return publicKey;
}
