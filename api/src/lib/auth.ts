import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { JwtPayload, Role } from '../types';

const JWT_SECRET        = process.env.JWT_SECRET!;
const JWT_SECRET_SUPER  = process.env.JWT_SECRET_SUPER!;

export function signToken(payload: JwtPayload, expiresIn: string = '8h'): string {
  const secret = payload.role === 'super_admin' ? JWT_SECRET_SUPER : JWT_SECRET;
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  // Try normal secret first, then super admin secret
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return jwt.verify(token, JWT_SECRET_SUPER) as JwtPayload;
  }
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
