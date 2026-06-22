import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { queryItems } from '../lib/cosmos';
import { requireAuth, requireRole, errorResponse } from '../lib/middleware';
import { PostDoc, QuizAttemptDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);

    const gradeFilter = jwt.role === 'teacher' ? ` AND c.grade = ${jwt.grade}` : '';

    const [posts, attempts] = await Promise.all([
      queryItems<Pick<PostDoc, 'id' | 'status' | 'quiz_json'>>(
        { query: `SELECT c.id, c.status, c.quiz_json FROM c WHERE c.school_id = @sid AND c.type = 'post'${gradeFilter}`, parameters: [{ name: '@sid', value: jwt.school_id }] },
        jwt.school_id
      ),
      queryItems<Pick<QuizAttemptDoc, 'percentage'>>(
        { query: `SELECT c.percentage FROM c WHERE c.school_id = @sid AND c.type = 'quiz_attempt'${gradeFilter}`, parameters: [{ name: '@sid', value: jwt.school_id }] },
        jwt.school_id
      ),
    ]);

    const published    = posts.filter((p) => p.status === 'published');
    const activeQuizzes = published.filter((p) => { try { return JSON.parse(p.quiz_json || '[]').length > 0; } catch { return false; } });
    const avgScore     = attempts.length > 0 ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length) : null;

    return {
      jsonBody: {
        published_posts: published.length,
        active_quizzes:  activeQuizzes.length,
        avg_quiz_score:  avgScore,
      },
    };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('dashboard-summary', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard/summary',
  handler,
});
