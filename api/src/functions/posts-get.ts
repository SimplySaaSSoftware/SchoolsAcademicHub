import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getItemById } from '../lib/db';
import { requireAuth, requireSchoolMatch, errorResponse, HttpError } from '../lib/middleware';
import { PostDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt  = requireAuth(req);
    const post = await getItemById<PostDoc>(req.params.id);
    if (!post) throw new HttpError(404, 'Post not found');
    requireSchoolMatch(jwt, post.school_id);
    if (jwt.role === 'student' && post.status !== 'published') throw new HttpError(404, 'Post not found');
    const { audit, ...rest } = post;
    return { jsonBody: jwt.role === 'student' ? rest : post };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-get', { methods: ['GET'], authLevel: 'anonymous', route: 'posts/{id}', handler });
