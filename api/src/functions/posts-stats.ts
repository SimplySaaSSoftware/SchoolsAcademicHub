import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, getItemById } from '../lib/db';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';
import { PostDoc, QuizAttemptDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);

    const id   = req.params.id;
    const post = await getItemById<PostDoc>(id);
    if (!post) throw new HttpError(404, 'Post not found');

    const [viewerRows, attemptRows] = await Promise.all([
      sql<{ student_id: string }[]>`
        SELECT data->>'student_id' AS student_id FROM items
        WHERE school_id = ${jwt.school_id} AND type = 'activity'
          AND data->>'post_id' = ${id}`,
      sql<{ data: QuizAttemptDoc }[]>`
        SELECT data FROM items
        WHERE school_id = ${jwt.school_id} AND type = 'quiz_attempt'
          AND data->>'post_id' = ${id}`,
    ]);

    const attempts      = attemptRows.map((r) => r.data);
    const uniqueViewers = new Set(viewerRows.map((r) => r.student_id)).size;
    const avgScore      = attempts.length > 0
      ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length)
      : null;
    const passRate = attempts.length > 0
      ? Math.round((attempts.filter((a) => a.passed).length / attempts.length) * 100)
      : null;

    return { jsonBody: { unique_viewers: uniqueViewers, quiz_attempts: attempts.length, avg_score: avgScore, pass_rate: passRate } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-stats', { methods: ['GET'], authLevel: 'anonymous', route: 'posts/{id}/stats', handler });
