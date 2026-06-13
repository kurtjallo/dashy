import crypto from 'node:crypto';
import { config } from '../config/env.js';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/** 32-byte AES key derived from the configured passphrase. */
const KEY = crypto.createHash('sha256').update(config.ENCRYPTION_KEY).digest();

/** Encrypt plaintext -> Buffer = iv(12) || authTag(16) || ciphertext (AES-256-GCM). */
export function encrypt(plaintext: string): Buffer {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

/** Reverse of encrypt: parse iv || authTag || ciphertext and return the plaintext. */
export function decrypt(ciphertext: Buffer): string {
  const iv = ciphertext.subarray(0, IV_LEN);
  const authTag = ciphertext.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = ciphertext.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
