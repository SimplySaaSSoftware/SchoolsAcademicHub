import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getItem, queryItems, getSchoolBySlug } from '../lib/cosmos';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';
import { buildViewersExport } from '../lib/excel';
import { PostDoc, ActivityDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt  = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);

    const id   = req.params.id;
    const post = await getItem<PostDoc>(id, jwt.school_id);
    if (!post) throw new HttpError(404, 'Post not found');

    const [school, activities] = await Promise.all([
      getSchoolBySlug(jwt.school_id),
      queryItems<ActivityDoc>(
        { query: 'SELECT * FROM c WHERE c.school_id = @sid AND c.type = @type AND c.post_id = @pid', parameters: [{ name: '@sid', value: jwt.school_id }, { name: '@type', value: 'activity' }, { name: '@pid', value: id }] },
        jwt.school_id
      ),
    ]);

    const buffer   = await buildViewersExport(post, activities, school);
    const filename = `viewers-${post.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.xlsx`;

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

app.http('export-post-viewers', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/export/post/{id}/viewers',
  handler,
});
