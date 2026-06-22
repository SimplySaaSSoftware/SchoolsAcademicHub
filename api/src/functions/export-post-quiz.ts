import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, getItemById, getSchoolBySlug } from '../lib/db';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';
import { buildQuizExport } from '../lib/excel';
import { PostDoc, QuizAttemptDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt  = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);

    const id   = req.params.id;
    const post = await getItemById<PostDoc>(id);
    if (!post) throw new HttpError(404, 'Post not found');

    const [school, attemptRows] = await Promise.all([
      getSchoolBySlug(jwt.school_id),
      sql<{ data: QuizAttemptDoc }[]>`
        SELECT data FROM items
        WHERE school_id = ${jwt.school_id} AND type = 'quiz_attempt'
          AND data->>'post_id' = ${id}
        ORDER BY data->>'student_name' ASC, (data->>'attempt_number')::int ASC`,
    ]);

    const buffer   = await buildQuizExport(post, attemptRows.map((r) => r.data), school);
    const filename = `quiz-${post.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.xlsx`;

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

app.http('export-post-quiz', { methods: ['GET'], authLevel: 'anonymous', route: 'admin/export/post/{id}/quiz', handler });
