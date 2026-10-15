import crypto from 'node:crypto';
import {requiredEnv} from '../config.js';

// Master key definition & derivation via HKDF (RFC 5869)
const MASTER_SECRET = requiredEnv('MASTER_KEY');
const SALT = Buffer.from('MILITARY_GRADE_HKDF_SALT_DOMAIN_2026', 'utf-8');

/**
 * Derives a 256-bit (32 bytes) Key Encryption Key (KEK) using HKDF-SHA256
 */
export function deriveKey(context: string): Buffer {
  const secretBuffer = Buffer.from(MASTER_SECRET, 'utf-8');
  try {
    const derivedKey = crypto.hkdfSync(
      'sha256',
      secretBuffer,
      SALT,
      Buffer.from(context, 'utf-8'),
      32
    );
    return Buffer.from(derivedKey);
  } finally {
    // Zero out volatile master buffer
    secretBuffer.fill(0);
  }
}

const DEK_DB = deriveKey('sqlite-storage-dek');

export interface EncryptedPayload {
  ciphertext: string; // Base64
  iv: string;         // Base64 (12 bytes / 96 bits)
  tag: string;        // Base64 (16 bytes / 128 bits)
}

/**
 * Encrypts arbitrary plaintext using AES-256-GCM with fresh 96-bit CSPRNG IV
 */
export function encryptAES256GCM(plaintext: string | Buffer): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', DEK_DB, iv);
  
  const inputBuffer = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf-8') : Buffer.from(plaintext);
  try {
    const encrypted = Buffer.concat([cipher.update(inputBuffer), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    };
  } finally {
    // Sanitizar memoria volátil del buffer de entrada
    inputBuffer.fill(0);
  }
}

/**
 * Decrypts AES-256-GCM payload and verifies 128-bit authentication tag
 * Throws on tampering or invalid tag
 */
export function decryptAES256GCM(payload: EncryptedPayload): string {
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  if (iv.length !== 12) {
    throw new Error('CriptoFallo: Longitud de IV inválida (requiere 96 bits / 12 bytes).');
  }
  if (tag.length !== 16) {
    throw new Error('CriptoFallo: Longitud de Tag inválida (requiere 128 bits / 16 bytes).');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', DEK_DB, iv);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const resultString = decrypted.toString('utf-8');
    decrypted.fill(0); // Limpieza activa en memoria
    return resultString;
  } catch (err) {
    throw new Error('CriptoFallo: Integridad violada o payload corrupto en desencriptación AES-256-GCM.');
  }
}

/**
 * Compact self-contained AEAD format: iv:tag:ciphertext (Base64)
 * Guarantees each field has its own independent 96-bit CSPRNG IV and 128-bit Tag
 */
export function encryptPacked(plaintext: string | Buffer): string {
  const payload = encryptAES256GCM(plaintext);
  return `${payload.iv}:${payload.tag}:${payload.ciphertext}`;
}

export function decryptPacked(packed: string): string {
  const parts = packed.split(':');
  if (parts.length !== 3) {
    throw new Error('CriptoFallo: Formato de payload cifrado packed inválido.');
  }
  return decryptAES256GCM({
    iv: parts[0],
    tag: parts[1],
    ciphertext: parts[2]
  });
}

/**
 * Wipes a sensitive memory buffer securely
 */
export function wipeBuffer(buf: Buffer): void {
  if (Buffer.isBuffer(buf)) {
    buf.fill(0);
  }
}

/**
 * Side-channel resistant constant-time string/buffer comparison
 */
export function timingSafeCompare(a: string | Buffer, b: string | Buffer): boolean {
  const bufA = typeof a === 'string' ? Buffer.from(a, 'utf-8') : a;
  const bufB = typeof b === 'string' ? Buffer.from(b, 'utf-8') : b;

  if (bufA.length !== bufB.length) {
    // Constant time dummy comparison to avoid timing leakage on length mismatch
    const dummy = Buffer.alloc(bufA.length);
    crypto.timingSafeEqual(bufA, dummy);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Computes a secure password hash using scrypt KDF with random 16-byte salt
 * Formatted as: scrypt$N=16384,r=8,p=1$hexSalt$hexHash
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const pwdBuffer = Buffer.from(password, 'utf-8');
  try {
    const key = crypto.scryptSync(pwdBuffer, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
    return `scrypt$16384$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
  } finally {
    pwdBuffer.fill(0);
  }
}

/**
 * Verifies password against scrypt hash in constant time
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    throw new Error('Hash inválido o algoritmo no reconocido.');
  }

  const N = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  const salt = Buffer.from(parts[4], 'hex');
  const expectedKey = Buffer.from(parts[5], 'hex');

  const pwdBuffer = Buffer.from(password, 'utf-8');
  try {
    const actualKey = crypto.scryptSync(pwdBuffer, salt, expectedKey.length, { N, r, p, maxmem: 32 * 1024 * 1024 });
    return crypto.timingSafeEqual(actualKey, expectedKey);
  } finally {
    pwdBuffer.fill(0);
  }
}
