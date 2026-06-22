import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql } from '../lib/db';
import { requireAuth, requireSchoolMatch, errorResponse } from '../lib/middleware';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt       = requireAuth(req);
    const school_id = req.query.get('school_id') ?? jwt.school_id;
    requireSchoolMatch(jwt, school_id);

    const grade   = req.query.get('grade');
    const subject = req.query.get('subject');
    const term    = req.query.get('term');

    const rows = await sql<{ data: any }[]>`
      SELECT data - 'audit' - 'content_html' AS data FROM items
      WHERE school_id = ${school_id} AND type = 'post'
        AND (${jwt.role === 'student'} = false OR data->>'status' = 'published')
        AND (${jwt.role === 'teacher' && !grade} = false OR data->>'grade' = ${grade ?? String(jwt.grade ?? '')})
        AND (${!grade || jwt.role !== 'teacher'} = true OR data->>'grade' = ${grade ?? ''})
        AND (${!subject} = true OR data->>'subject' = ${subject ?? ''})
        AND (${!term}    = true OR data->>'term'    = ${term ?? ''})
      ORDER BY data->>'created_at' DESC`;

    return { jsonBody: rows.map((r) => r.data) };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-list', { methods: ['GET'], authLevel: 'anonymous', route: 'posts', handler });
