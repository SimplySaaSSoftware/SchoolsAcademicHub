import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, getItemById } from '../lib/db';
import { requireAuth, requireRole, errorResponse, effectiveSchoolId, assertPostAccess, HttpError } from '../lib/middleware';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);
    const schoolId = effectiveSchoolId(req, jwt);

    const post = await getItemById<{ school_id: string; grade: number; subject: string }>(req.params.id);
    if (!post) throw new HttpError(404, 'Post not found');
    await assertPostAccess(jwt, post);

    const rows = await sql<{ data: any }[]>`
      SELECT data FROM items
      WHERE school_id = ${schoolId} AND type = 'quiz_attempt'
        AND data->>'post_id' = ${req.params.id}
      ORDER BY data->>'student_name' ASC, (data->>'attempt_number')::int ASC`;

    return { jsonBody: rows.map((r) => r.data) };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-quiz-results', { methods: ['GET'], authLevel: 'anonymous', route: 'posts/{id}/quiz-results', handler });
