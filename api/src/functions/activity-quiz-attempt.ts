import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createItem, queryItems } from '../lib/cosmos';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';
import { QuizAttemptDoc } from '../types';
import { randomUUID } from 'crypto';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['student']);

    const body = await req.json() as {
      post_id: string; post_title: string; subject: string; term: string;
      score: number; total: number;
      answers: QuizAttemptDoc['answers'];
      time_taken_seconds?: number;
    };
    if (!body.post_id || body.score === undefined || !body.total) {
      throw new HttpError(400, 'post_id, score, total required');
    }

    // Count existing attempts for this student + post to auto-increment
    const existing = await queryItems<{ id: string }>(
      {
        query: 'SELECT c.id FROM c WHERE c.school_id = @sid AND c.type = @type AND c.post_id = @pid AND c.student_id = @stid',
        parameters: [
          { name: '@sid',  value: jwt.school_id },
          { name: '@type', value: 'quiz_attempt' },
          { name: '@pid',  value: body.post_id },
          { name: '@stid', value: jwt.user_id },
        ],
      },
      jwt.school_id
    );

    const pct  = body.total > 0 ? Math.round((body.score / body.total) * 100) : 0;
    const doc: QuizAttemptDoc = {
      id:                 randomUUID(),
      school_id:          jwt.school_id,
      type:               'quiz_attempt',
      student_id:         jwt.user_id,
      student_name:       jwt.name ?? jwt.user_id,
      grade:              jwt.grade!,
      post_id:            body.post_id,
      post_title:         body.post_title ?? '',
      subject:            body.subject ?? '',
      term:               body.term ?? '',
      attempt_number:     existing.length + 1,
      score:              body.score,
      total:              body.total,
      percentage:         pct,
      passed:             pct >= 80,
      answers:            body.answers ?? [],
      time_taken_seconds: body.time_taken_seconds,
      timestamp:          new Date().toISOString(),
      created_at:         new Date().toISOString(),
      ttl:                63_072_000,
    };

    await createItem(doc);
    return { status: 201, jsonBody: { ok: true, percentage: pct, passed: doc.passed, attempt_number: doc.attempt_number } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('activity-quiz-attempt', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'activity/quiz-attempt',
  handler,
});
