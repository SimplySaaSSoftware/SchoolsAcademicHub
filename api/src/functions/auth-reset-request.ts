import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getSchoolBySlug, queryItems, createItem } from '../lib/cosmos';
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

    const users = await queryItems<UserDoc>(
      {
        query: 'SELECT * FROM c WHERE c.school_id = @sid AND c.type = @type AND c.email = @email AND c.active = true',
        parameters: [
          { name: '@sid',   value: school.school_id },
          { name: '@type',  value: 'user' },
          { name: '@email', value: email.toLowerCase().trim() },
        ],
      },
      school.school_id
    );

    // Always return 200 to prevent email enumeration
    if (users.length === 0) return { jsonBody: { ok: true } };

    const user  = users[0];
    const token = generateResetToken();
    const expiry = new Date(Date.now() + 3600_000).toISOString();
    const baseUrl = process.env.SITE_URL ?? 'https://localhost:4280';

    const doc: ResetTokenDoc = {
      id:         randomUUID(),
      school_id:  school.school_id,
      type:       'reset_token',
      user_id:    user.id,
      token,
      expires_at: expiry,
      created_at: new Date().toISOString(),
      ttl:        3600,
    };
    await createItem(doc);

    const resetUrl = `${baseUrl}/reset-password?token=${token}&school=${slug}`;
    await sendPasswordReset(user.email, user.name, resetUrl, school);

    return { jsonBody: { ok: true } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('auth-reset-request', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/reset-request',
  handler,
});
