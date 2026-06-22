import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, getSchoolBySlug, updateItemById, deleteItemById } from '../lib/db';
import { hashPassword } from '../lib/auth';
import { errorResponse, HttpError } from '../lib/middleware';
import { ResetTokenDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const { slug, token, newPassword } = await req.json() as { slug: string; token: string; newPassword: string };
    if (!slug || !token || !newPassword) throw new HttpError(400, 'slug, token, and newPassword required');
    if (newPassword.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

    const school = await getSchoolBySlug(slug);
    if (!school || !school.active) throw new HttpError(404, 'School not found');

    const rows = await sql<{ data: ResetTokenDoc }[]>`
      SELECT data FROM items
      WHERE school_id = ${school.school_id} AND type = 'reset_token'
        AND data->>'token' = ${token}`;

    const doc = rows[0]?.data;
    if (!doc) throw new HttpError(400, 'Invalid or expired reset token');
    if (new Date(doc.expires_at) < new Date()) throw new HttpError(400, 'Reset token has expired');

    await updateItemById(doc.user_id, school.school_id, 'user', { password_hash: await hashPassword(newPassword) });
    await deleteItemById(doc.id);

    return { jsonBody: { ok: true } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('auth-reset-confirm', { methods: ['POST'], authLevel: 'anonymous', route: 'auth/reset-confirm', handler });
