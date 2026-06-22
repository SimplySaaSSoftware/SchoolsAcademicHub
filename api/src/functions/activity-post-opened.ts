import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { insertItem } from '../lib/db';
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

    const now = new Date().toISOString();
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
      timestamp:    now,
      created_at:   now,
    };

    await insertItem(doc);
    return { jsonBody: { ok: true } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('activity-post-opened', { methods: ['POST'], authLevel: 'anonymous', route: 'activity/post-opened', handler });
