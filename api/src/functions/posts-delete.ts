import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getItem, deleteItem } from '../lib/cosmos';
import { requireAuth, requireRole, requireSchoolMatch, errorResponse, HttpError } from '../lib/middleware';
import { PostDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt  = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);

    const id   = req.params.id;
    const post = await getItem<PostDoc>(id, jwt.school_id);
    if (!post) throw new HttpError(404, 'Post not found');
    requireSchoolMatch(jwt, post.school_id);

    // Teachers can only delete their own posts
    if (jwt.role === 'teacher' && post.author_id !== jwt.user_id) {
      throw new HttpError(403, 'You can only delete your own posts');
    }

    await deleteItem(id, jwt.school_id);
    return { status: 204 };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-delete', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'posts/{id}',
  handler,
});
