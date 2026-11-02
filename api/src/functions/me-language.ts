import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, updateItemById } from '../lib/db';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';
import { isLang } from '../lib/translation';
import { StudentDoc } from '../types';

/** POST /me/language { lang } — a student with their own profile saves their language so it follows them to any device. */
async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['student']);
    const { lang } = await req.json() as { lang?: unknown };
    if (!isLang(lang)) throw new HttpError(400, 'lang must be "en" or "af"');
    // Shared grade PINs have no profile: only individual students are stored
    const rows = await sql<{ id: string }[]>`SELECT id FROM items WHERE id = ${jwt.user_id} AND school_id = ${jwt.school_id} AND type = 'student'`;
    if (rows[0]) await updateItemById<StudentDoc>(jwt.user_id, jwt.school_id, 'student', { lang });
    return { jsonBody: { ok: true } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('me-language', { methods: ['POST'], authLevel: 'anonymous', route: 'me/language', handler });
