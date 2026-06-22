import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql } from '../lib/db';
import { requireAuth, requireRole, errorResponse } from '../lib/middleware';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);

    const rows = await sql<{ data: any }[]>`
      SELECT data FROM items
      WHERE school_id = ${jwt.school_id} AND type = 'activity'
        AND data->>'post_id' = ${req.params.id}
      ORDER BY data->>'timestamp' ASC`;

    return { jsonBody: rows.map((r) => r.data) };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-viewers', { methods: ['GET'], authLevel: 'anonymous', route: 'posts/{id}/viewers', handler });
