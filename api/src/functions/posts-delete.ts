import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getItemById, deleteItemById } from '../lib/db';
import { requireAuth, requireRole, requireSchoolMatch, errorResponse, HttpError } from '../lib/middleware';
import { PostDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt  = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);
    const post = await getItemById<PostDoc>(req.params.id);
    if (!post) throw new HttpError(404, 'Post not found');
    requireSchoolMatch(jwt, post.school_id);
    if (jwt.role === 'teacher' && post.author_id !== jwt.user_id) throw new HttpError(403, 'You can only delete your own posts');
    await deleteItemById(req.params.id);
    return { status: 204 };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-delete', { methods: ['DELETE'], authLevel: 'anonymous', route: 'posts/{id}', handler });
