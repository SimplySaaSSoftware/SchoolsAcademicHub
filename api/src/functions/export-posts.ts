import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { queryItems, getSchoolBySlug } from '../lib/cosmos';
import { requireAuth, requireRole, errorResponse } from '../lib/middleware';
import { buildPostsExport } from '../lib/excel';
import { PostDoc, QuizAttemptDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['admin', 'super_admin']);

    const [school, posts, attempts] = await Promise.all([
      getSchoolBySlug(jwt.school_id),
      queryItems<PostDoc>(
        { query: 'SELECT * FROM c WHERE c.school_id = @sid AND c.type = @type ORDER BY c.created_at DESC', parameters: [{ name: '@sid', value: jwt.school_id }, { name: '@type', value: 'post' }] },
        jwt.school_id
      ),
      queryItems<QuizAttemptDoc>(
        { query: 'SELECT * FROM c WHERE c.school_id = @sid AND c.type = @type', parameters: [{ name: '@sid', value: jwt.school_id }, { name: '@type', value: 'quiz_attempt' }] },
        jwt.school_id
      ),
    ]);

    const attemptsByPost = new Map<string, QuizAttemptDoc[]>();
    attempts.forEach((a) => {
      if (!attemptsByPost.has(a.post_id)) attemptsByPost.set(a.post_id, []);
      attemptsByPost.get(a.post_id)!.push(a);
    });

    const buffer = await buildPostsExport(posts, attemptsByPost, school);
    const filename = `posts-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

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

app.http('export-posts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/export/posts',
  handler,
});
