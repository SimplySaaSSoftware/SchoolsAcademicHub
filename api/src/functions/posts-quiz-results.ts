import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { queryItems } from '../lib/cosmos';
import { requireAuth, requireRole, errorResponse } from '../lib/middleware';
import { QuizAttemptDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);

    const attempts = await queryItems<QuizAttemptDoc>(
      {
        query: 'SELECT * FROM c WHERE c.school_id = @sid AND c.type = @type AND c.post_id = @pid ORDER BY c.student_name ASC, c.attempt_number ASC',
        parameters: [
          { name: '@sid',  value: jwt.school_id },
          { name: '@type', value: 'quiz_attempt' },
          { name: '@pid',  value: req.params.id },
        ],
      },
      jwt.school_id
    );

    return { jsonBody: attempts };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-quiz-results', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'posts/{id}/quiz-results',
  handler,
});
