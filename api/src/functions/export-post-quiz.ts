import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getItem, queryItems, getSchoolBySlug } from '../lib/cosmos';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';
import { buildQuizExport } from '../lib/excel';
import { PostDoc, QuizAttemptDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt  = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);

    const id   = req.params.id;
    const post = await getItem<PostDoc>(id, jwt.school_id);
    if (!post) throw new HttpError(404, 'Post not found');

    const [school, attempts] = await Promise.all([
      getSchoolBySlug(jwt.school_id),
      queryItems<QuizAttemptDoc>(
        { query: 'SELECT * FROM c WHERE c.school_id = @sid AND c.type = @type AND c.post_id = @pid ORDER BY c.student_name ASC, c.attempt_number ASC', parameters: [{ name: '@sid', value: jwt.school_id }, { name: '@type', value: 'quiz_attempt' }, { name: '@pid', value: id }] },
        jwt.school_id
      ),
    ]);

    const buffer   = await buildQuizExport(post, attempts, school);
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

app.http('export-post-quiz', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/export/post/{id}/quiz',
  handler,
});
