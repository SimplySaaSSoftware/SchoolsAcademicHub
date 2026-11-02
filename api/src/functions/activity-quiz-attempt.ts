import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, insertItem, getItemById } from '../lib/db';
import { requireAuth, requireRole, requireSchoolMatch, errorResponse, effectiveSchoolId, HttpError } from '../lib/middleware';
import { PostDoc, QuizAttemptDoc } from '../types';
import { isLang, quizForLang } from '../lib/translation';
import { randomUUID } from 'crypto';

/**
 * POST /activity/quiz-attempt
 * Body: { post_id, selections: number[], lang?, time_taken_seconds? }
 * The server grades against the stored quiz. Any score the client sends is ignored.
 */
async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['student']);
    const schoolId = effectiveSchoolId(req, jwt);

    const body = await req.json() as {
      post_id?: string; selections?: unknown; lang?: string; time_taken_seconds?: number;
    };
    if (!body.post_id) throw new HttpError(400, 'post_id required');

    const post = await getItemById<PostDoc>(body.post_id);
    if (!post || post.status !== 'published') throw new HttpError(404, 'Post not found');
    requireSchoolMatch(jwt, post.school_id);

    const lang = isLang(body.lang) ? body.lang : null;
    const quiz = quizForLang(post, lang);
    if (quiz.length === 0) throw new HttpError(400, 'This post has no quiz');

    const sel = body.selections;
    if (!Array.isArray(sel) || sel.length !== quiz.length ||
        sel.some((s, i) => !Number.isInteger(s) || s < 0 || s >= quiz[i].options.length)) {
      throw new HttpError(400, 'Answer every question with one of its options');
    }

    const answers: QuizAttemptDoc['answers'] = quiz.map((q, i) => ({
      question_index: i,
      chosen:         sel[i] as number,
      correct:        q.correct_index,
      is_right:       sel[i] === q.correct_index,
      question:       q.question,
      selected_text:  q.options[sel[i] as number],
    }));
    const score = answers.filter((a) => a.is_right).length;
    const total = quiz.length;
    const pct   = Math.round((score / total) * 100);

    const countRows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM items
      WHERE school_id = ${schoolId} AND type = 'quiz_attempt'
        AND data->>'post_id' = ${post.id}
        AND data->>'student_id' = ${jwt.user_id}`;
    const attemptNumber = Number(countRows[0]?.count ?? 0) + 1;
    const now = new Date().toISOString();

    const doc: QuizAttemptDoc = {
      id:                 randomUUID(),
      school_id:          schoolId,
      type:               'quiz_attempt',
      student_id:         jwt.user_id,
      student_name:       jwt.name ?? jwt.user_id,
      grade:              jwt.grade!,
      post_id:            post.id,
      post_title:         post.title,
      subject:            post.subject,
      term:               post.term,
      attempt_number:     attemptNumber,
      ...(lang ? { lang } : {}),
      score,
      total,
      percentage:         pct,
      passed:             pct >= 80,
      answers,
      time_taken_seconds: typeof body.time_taken_seconds === 'number' ? Math.max(0, Math.round(body.time_taken_seconds)) : undefined,
      timestamp:          now,
      created_at:         now,
    };

    await insertItem(doc);
    return {
      status: 201,
      jsonBody: {
        ok: true, score, total, percentage: pct, passed: doc.passed, attempt_number: attemptNumber,
        // revealed only after submitting
        results: answers.map((a) => ({ is_right: a.is_right, correct_index: a.correct })),
      },
    };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('activity-quiz-attempt', { methods: ['POST'], authLevel: 'anonymous', route: 'activity/quiz-attempt', handler });
