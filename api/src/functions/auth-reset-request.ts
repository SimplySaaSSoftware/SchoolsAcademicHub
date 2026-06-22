import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, getSchoolBySlug, insertItem } from '../lib/db';
import { generateResetToken } from '../lib/auth';
import { sendPasswordReset } from '../lib/resend';
import { errorResponse, HttpError } from '../lib/middleware';
import { UserDoc, ResetTokenDoc } from '../types';
import { randomUUID } from 'crypto';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const { slug, email } = await req.json() as { slug: string; email: string };
    if (!slug || !email) throw new HttpError(400, 'slug and email required');

    const school = await getSchoolBySlug(slug);
    if (!school || !school.active) throw new HttpError(404, 'School not found');

    const rows = await sql<{ data: UserDoc }[]>`
      SELECT data FROM items
      WHERE school_id = ${school.school_id} AND type = 'user'
        AND data->>'email' = ${email.toLowerCase().trim()}
        AND (data->>'active')::boolean = true`;

    if (rows.length === 0) return { jsonBody: { ok: true } };

    const user  = rows[0].data;
    const token = generateResetToken();
    const doc: ResetTokenDoc = {
      id: randomUUID(), school_id: school.school_id, type: 'reset_token',
      user_id: user.id, token, expires_at: new Date(Date.now() + 3600_000).toISOString(),
      created_at: new Date().toISOString(), ttl: 3600,
    };
    await insertItem(doc);

    const baseUrl  = process.env.SITE_URL ?? 'https://localhost:4280';
    await sendPasswordReset(user.email, user.name, `${baseUrl}/reset-password?token=${token}&school=${slug}`, school);
    return { jsonBody: { ok: true } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('auth-reset-request', { methods: ['POST'], authLevel: 'anonymous', route: 'auth/reset-request', handler });
