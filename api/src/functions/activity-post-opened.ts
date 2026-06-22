import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createItem } from '../lib/cosmos';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';
import { ActivityDoc } from '../types';
import { randomUUID } from 'crypto';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['student']);

    const { post_id, post_title, subject, term } = await req.json() as {
      post_id: string; post_title: string; subject: string; term: string;
    };
    if (!post_id) throw new HttpError(400, 'post_id required');

    const doc: ActivityDoc = {
      id:           randomUUID(),
      school_id:    jwt.school_id,
      type:         'activity',
      event:        'post_opened',
      student_id:   jwt.user_id,
      student_name: jwt.name ?? jwt.user_id,
      grade:        jwt.grade!,
      post_id,
      post_title:   post_title ?? '',
      subject:      subject ?? '',
      term:         term ?? '',
      timestamp:    new Date().toISOString(),
      created_at:   new Date().toISOString(),
      ttl:          63_072_000, // 2 years
    };

    await createItem(doc);
    return { jsonBody: { ok: true } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('activity-post-opened', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'activity/post-opened',
  handler,
});
