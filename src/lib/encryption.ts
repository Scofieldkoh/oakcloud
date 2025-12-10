/**
 * Encryption Utilities
 *
 * AES-256-GCM encryption for sensitive data storage (connector credentials).
 * Requires ENCRYPTION_KEY environment variable (32+ characters).
 */

import crypto from 'crypto';
import {
  ENCRYPTION_ALGORITHM,
  ENCRYPTION_IV_LENGTH,
  ENCRYPTION_TAG_LENGTH,
} from './constants/application';

/**
 * Get the encryption key from environment variable
 * @returns Buffer - 32-byte encryption key
 * @throws Error if ENCRYPTION_KEY is not set
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required for credential encryption');
  }
  // Hash the key to ensure it's exactly 32 bytes for AES-256
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt plaintext using AES-256-GCM
 *
 * @param plaintext - The string to encrypt
 * @returns Encrypted string in format: iv:tag:ciphertext (hex encoded)
 *
 * @example
 * const encrypted = encrypt(JSON.stringify({ apiKey: 'sk-xxx' }));
 * // Returns: "a1b2c3...:d4e5f6...:encrypted_data..."
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  // Format: iv:tag:encrypted (all hex encoded)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt ciphertext using AES-256-GCM
 *
 * @param ciphertext - Encrypted string in format: iv:tag:ciphertext
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails or format is invalid
 *
 * @example
 * const decrypted = decrypt(encryptedString);
 * const credentials = JSON.parse(decrypted);
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) {
    throw new Error('Cannot decrypt: ciphertext is empty or undefined');
  }
  const key = getEncryptionKey();
  const parts = ciphertext.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, tagHex, encrypted] = parts;

  if (!ivHex || !tagHex || !encrypted) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  if (iv.length !== ENCRYPTION_IV_LENGTH) {
    throw new Error('Invalid IV length');
  }

  if (tag.length !== ENCRYPTION_TAG_LENGTH) {
    throw new Error('Invalid auth tag length');
  }

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt a JSON object
 *
 * @param data - Object to encrypt
 * @returns Encrypted string
 */
export function encryptJson<T extends Record<string, unknown>>(data: T): string {
  return encrypt(JSON.stringify(data));
}

/**
 * Decrypt to a JSON object
 *
 * @param ciphertext - Encrypted string
 * @returns Decrypted object
 */
export function decryptJson<T extends Record<string, unknown>>(ciphertext: string): T {
  return JSON.parse(decrypt(ciphertext)) as T;
}

/**
 * Mask a sensitive string for display (e.g., API keys)
 * Shows first 4 and last 4 characters with dots in between
 *
 * @param value - The string to mask
 * @param visibleChars - Number of characters to show at start and end (default: 4)
 * @returns Masked string (e.g., "sk-a...xyz1")
 */
export function maskSensitive(value: string, visibleChars: number = 4): string {
  if (!value || value.length <= visibleChars * 2) {
    return '*'.repeat(value?.length || 8);
  }
  const start = value.slice(0, visibleChars);
  const end = value.slice(-visibleChars);
  return `${start}...${end}`;
}
