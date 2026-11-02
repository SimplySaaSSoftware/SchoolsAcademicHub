import { HttpRequest } from '@azure/functions';
import { randomUUID } from 'crypto';
import { sql, insertItem } from './db';
import { HttpError } from './middleware';

const WINDOW_MINUTES = 10;
const MAX_FAILURES   = 10;

function clientIp(req: HttpRequest): string | null {
  const raw = req.headers.get('x-forwarded-for') ?? '';
  const ip = raw.split(',')[0]?.trim().replace(/:\d+$/, '');
  return ip || null;
}

/** Throws 429 after too many failed logins from one address. 6-digit PINs are guessable without this. */
export async function assertNotThrottled(req: HttpRequest, schoolId: string): Promise<void> {
  const ip = clientIp(req);
  if (!ip) return;
  const rows = await sql<{ n: string }[]>`
    SELECT COUNT(*)::text AS n FROM items
    WHERE school_id = ${schoolId} AND type = 'login_fail'
      AND data->>'ip' = ${ip}
      AND (data->>'created_at')::timestamptz > now() - make_interval(mins => ${WINDOW_MINUTES})`;
  if (Number(rows[0]?.n ?? 0) >= MAX_FAILURES) {
    throw new HttpError(429, `Too many failed attempts. Please wait ${WINDOW_MINUTES} minutes and try again.`);
  }
}

export async function recordFailure(req: HttpRequest, schoolId: string): Promise<void> {
  const ip = clientIp(req);
  if (!ip) return;
  await insertItem({ id: randomUUID(), school_id: schoolId, type: 'login_fail', ip, created_at: new Date().toISOString() });
  if (Math.random() < 0.05) {
    await sql`DELETE FROM items WHERE type = 'login_fail' AND created_at < now() - interval '1 day'`;
  }
}
