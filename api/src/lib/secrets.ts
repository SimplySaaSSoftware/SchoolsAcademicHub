import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/** Encrypts small secrets (such as a Google refresh token) before they are stored in the database. AES-256-GCM, key derived from the server's JWT secret. */
const key = () => createHash('sha256').update(`secrets:${process.env.JWT_SECRET_SUPER || process.env.JWT_SECRET || ''}`).digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
