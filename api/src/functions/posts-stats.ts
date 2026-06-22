import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getItem, queryItems } from '../lib/cosmos';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';
import { PostDoc, ActivityDoc, QuizAttemptDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);

    const id   = req.params.id;
    const post = await getItem<PostDoc>(id, jwt.school_id);
    if (!post) throw new HttpError(404, 'Post not found');

    const [activities, attempts] = await Promise.all([
      queryItems<ActivityDoc>(
        { query: 'SELECT c.student_id FROM c WHERE c.school_id = @sid AND c.type = @type AND c.post_id = @pid', parameters: [{ name: '@sid', value: jwt.school_id }, { name: '@type', value: 'activity' }, { name: '@pid', value: id }] },
        jwt.school_id
      ),
      queryItems<QuizAttemptDoc>(
        { query: 'SELECT * FROM c WHERE c.school_id = @sid AND c.type = @type AND c.post_id = @pid', parameters: [{ name: '@sid', value: jwt.school_id }, { name: '@type', value: 'quiz_attempt' }, { name: '@pid', value: id }] },
        jwt.school_id
      ),
    ]);

    const uniqueViewers = new Set(activities.map((a) => a.student_id)).size;
    const avgScore = attempts.length > 0
      ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length)
      : null;
    const passRate = attempts.length > 0
      ? Math.round((attempts.filter((a) => a.passed).length / attempts.length) * 100)
      : null;

    return {
      jsonBody: {
        unique_viewers: uniqueViewers,
        quiz_attempts:  attempts.length,
        avg_score:      avgScore,
        pass_rate:      passRate,
      },
    };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-stats', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'posts/{id}/stats',
  handler,
});
