import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getSchoolBySlug, queryItems, updateItem, deleteItem } from '../lib/cosmos';
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

    const tokens = await queryItems<ResetTokenDoc>(
      {
        query: 'SELECT * FROM c WHERE c.school_id = @sid AND c.type = @type AND c.token = @token',
        parameters: [
          { name: '@sid',   value: school.school_id },
          { name: '@type',  value: 'reset_token' },
          { name: '@token', value: token },
        ],
      },
      school.school_id
    );

    const doc = tokens[0];
    if (!doc) throw new HttpError(400, 'Invalid or expired reset token');
    if (new Date(doc.expires_at) < new Date()) throw new HttpError(400, 'Reset token has expired');

    const hash = await hashPassword(newPassword);
    await updateItem(doc.user_id, school.school_id, { password_hash: hash });
    await deleteItem(doc.id, school.school_id);

    return { jsonBody: { ok: true } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('auth-reset-confirm', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/reset-confirm',
  handler,
});
