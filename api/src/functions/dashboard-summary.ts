import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql } from '../lib/db';
import { requireAuth, requireRole, errorResponse, effectiveSchoolId } from '../lib/middleware';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);
    const schoolId = effectiveSchoolId(req, jwt);

    const gradeClause = jwt.role === 'teacher' && jwt.grade
      ? sql` AND (data->>'grade')::int = ${jwt.grade}`
      : sql``;

    const [postRows, attemptRows] = await Promise.all([
      sql<{ status: string; quiz_json: string }[]>`
        SELECT data->>'status' AS status, data->>'quiz_json' AS quiz_json FROM items
        WHERE school_id = ${schoolId} AND type = 'post'${gradeClause}`,
      sql<{ percentage: string }[]>`
        SELECT data->>'percentage' AS percentage FROM items
        WHERE school_id = ${schoolId} AND type = 'quiz_attempt'${gradeClause}`,
    ]);

    const published     = postRows.filter((p) => p.status === 'published');
    const activeQuizzes = published.filter((p) => { try { return JSON.parse(p.quiz_json || '[]').length > 0; } catch { return false; } });
    const attempts      = attemptRows.map((r) => Number(r.percentage));
    const avgScore      = attempts.length > 0 ? Math.round(attempts.reduce((s, v) => s + v, 0) / attempts.length) : null;

    return { jsonBody: { published_posts: published.length, active_quizzes: activeQuizzes.length, avg_quiz_score: avgScore } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('dashboard-summary', { methods: ['GET'], authLevel: 'anonymous', route: 'dashboard/summary', handler });
