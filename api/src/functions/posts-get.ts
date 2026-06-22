import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getItem } from '../lib/cosmos';
import { requireAuth, requireSchoolMatch, errorResponse, HttpError } from '../lib/middleware';
import { PostDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt  = requireAuth(req);
    const id   = req.params.id;
    const post = await getItem<PostDoc>(id, jwt.school_id);
    if (!post) throw new HttpError(404, 'Post not found');
    requireSchoolMatch(jwt, post.school_id);
    if (jwt.role === 'student' && post.status !== 'published') throw new HttpError(404, 'Post not found');

    // Strip audit from student responses
    const { audit, ...rest } = post;
    const data = jwt.role === 'student' || jwt.role === 'teacher' ? rest : post;

    return { jsonBody: data };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-get', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'posts/{id}',
  handler,
});
