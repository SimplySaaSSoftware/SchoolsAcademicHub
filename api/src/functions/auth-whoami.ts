import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as jwt from 'jsonwebtoken';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  const envCheck = {
    JWT_SECRET:               !!process.env.JWT_SECRET,
    JWT_SECRET_SUPER:         !!process.env.JWT_SECRET_SUPER,
    SUPER_ADMIN_EMAIL:        !!process.env.SUPER_ADMIN_EMAIL,
    SUPER_ADMIN_PASSWORD_HASH:!!process.env.SUPER_ADMIN_PASSWORD_HASH,
  };

  if (!token) return { jsonBody: { error: 'No token', envCheck } };

  const decoded = (() => { try { return jwt.decode(token); } catch { return null; } })();

  const results: Record<string, string> = {};
  for (const [key, secret] of [
    ['JWT_SECRET',       process.env.JWT_SECRET],
    ['JWT_SECRET_SUPER', process.env.JWT_SECRET_SUPER],
  ] as [string, string | undefined][]) {
    if (!secret) { results[key] = 'NOT SET'; continue; }
    try { jwt.verify(token, secret); results[key] = 'VALID'; }
    catch (e: any) { results[key] = e.message; }
  }

  return { jsonBody: { decoded, verifyResults: results, envCheck } };
}

app.http('auth-whoami', { methods: ['GET'], authLevel: 'anonymous', route: 'auth/whoami', handler });
