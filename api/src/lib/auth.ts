import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { randomUUID, createHmac, randomInt } from 'crypto';
import { JwtPayload, Role } from '../types';

const JWT_SECRET = (process.env.JWT_SECRET_SUPER || process.env.JWT_SECRET)!;

export function signToken(payload: JwtPayload, expiresIn: string = '8h'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateResetToken(): string {
  return randomUUID();
}

export function studentExpiry(role: Role): string {
  return role === 'student' ? '24h' : '8h';
}

/** Keyed hash used to find a student by PIN without scanning every account. Useless without the server secret. */
export function pinLookup(pin: string): string {
  return createHmac('sha256', JWT_SECRET).update(`student-pin:${pin}`).digest('hex');
}

export function generatePin(): string {
  return String(randomInt(100000, 1000000));
}
