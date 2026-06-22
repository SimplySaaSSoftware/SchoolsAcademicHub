import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, insertItem } from '../lib/db';
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

    const countRows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM items
      WHERE school_id = ${jwt.school_id} AND type = 'quiz_attempt'
        AND data->>'post_id' = ${body.post_id}
        AND data->>'student_id' = ${jwt.user_id}`;

    const attemptNumber = Number(countRows[0]?.count ?? 0) + 1;
    const pct           = body.total > 0 ? Math.round((body.score / body.total) * 100) : 0;
    const now           = new Date().toISOString();

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
      attempt_number:     attemptNumber,
      score:              body.score,
      total:              body.total,
      percentage:         pct,
      passed:             pct >= 80,
      answers:            body.answers ?? [],
      time_taken_seconds: body.time_taken_seconds,
      timestamp:          now,
      created_at:         now,
    };

    await insertItem(doc);
    return { status: 201, jsonBody: { ok: true, percentage: pct, passed: doc.passed, attempt_number: doc.attempt_number } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('activity-quiz-attempt', { methods: ['POST'], authLevel: 'anonymous', route: 'activity/quiz-attempt', handler });
