import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, getSchoolBySlug } from '../lib/db';
import { requireAuth, requireRole, errorResponse, effectiveSchoolId } from '../lib/middleware';
import { buildPostsExport } from '../lib/excel';
import { PostDoc, QuizAttemptDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['admin', 'super_admin']);
    const schoolId = effectiveSchoolId(req, jwt);

    const [school, postRows, attemptRows] = await Promise.all([
      getSchoolBySlug(schoolId),
      sql<{ data: PostDoc }[]>`
        SELECT data FROM items WHERE school_id = ${schoolId} AND type = 'post'
        ORDER BY data->>'created_at' DESC`,
      sql<{ data: QuizAttemptDoc }[]>`
        SELECT data FROM items WHERE school_id = ${schoolId} AND type = 'quiz_attempt'`,
    ]);

    const posts    = postRows.map((r) => r.data);
    const attempts = attemptRows.map((r) => r.data);

    const attemptsByPost = new Map<string, QuizAttemptDoc[]>();
    attempts.forEach((a) => {
      if (!attemptsByPost.has(a.post_id)) attemptsByPost.set(a.post_id, []);
      attemptsByPost.get(a.post_id)!.push(a);
    });

    const buffer   = await buildPostsExport(posts, attemptsByPost, school);
    const filename = `posts-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return {
      body: buffer,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('export-posts', { methods: ['GET'], authLevel: 'anonymous', route: 'admin/export/posts', handler });
