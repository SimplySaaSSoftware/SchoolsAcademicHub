import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, getItemById, getSchoolBySlug } from '../lib/db';
import { requireAuth, requireRole, errorResponse, HttpError, effectiveSchoolId } from '../lib/middleware';
import { buildViewersExport } from '../lib/excel';
import { PostDoc, ActivityDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt  = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);
    const schoolId = effectiveSchoolId(req, jwt);

    const id   = req.params.id;
    const post = await getItemById<PostDoc>(id);
    if (!post) throw new HttpError(404, 'Post not found');

    const [school, activityRows] = await Promise.all([
      getSchoolBySlug(schoolId),
      sql<{ data: ActivityDoc }[]>`
        SELECT data FROM items
        WHERE school_id = ${schoolId} AND type = 'activity'
          AND data->>'post_id' = ${id}`,
    ]);

    const buffer   = await buildViewersExport(post, activityRows.map((r) => r.data), school);
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

app.http('export-post-viewers', { methods: ['GET'], authLevel: 'anonymous', route: 'admin/export/post/{id}/viewers', handler });
