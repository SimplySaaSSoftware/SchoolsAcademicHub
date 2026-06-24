import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { insertItem } from '../lib/db';
import { requireAuth, requireRole, errorResponse, HttpError, effectiveSchoolId } from '../lib/middleware';
import { PostDoc } from '../types';
import { randomUUID } from 'crypto';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt  = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);
    const schoolId = effectiveSchoolId(req, jwt);

    const body = await req.json() as Partial<PostDoc> & { status?: 'draft' | 'published' };
    if (!body.title || !body.grade || !body.subject || !body.term) {
      throw new HttpError(400, 'title, grade, subject, and term are required');
    }

    const now    = new Date().toISOString();
    const status = body.status ?? 'draft';

    const post: PostDoc = {
      id:               randomUUID(),
      school_id:        schoolId,
      type:             'post',
      title:            body.title,
      grade:            Number(body.grade),
      subject:          body.subject,
      term:             body.term,
      content_html:     body.content_html ?? '',
      attachments_json: body.attachments_json ?? '[]',
      quiz_json:        body.quiz_json ?? '[]',
      quiz_hide_content: body.quiz_hide_content ?? false,
      status,
      author_id:        jwt.user_id,
      author_name:      jwt.name ?? jwt.user_id,
      created_at:       now,
      updated_at:       now,
      ...(status === 'published' ? { published_at: now, published_by_id: jwt.user_id, published_by_name: jwt.name } : {}),
      audit: [{
        action:    'created',
        user_id:   jwt.user_id,
        user_name: jwt.name ?? jwt.user_id,
        user_role: jwt.role,
        timestamp: now,
      }],
    };

    const created = await insertItem(post);
    return { status: 201, jsonBody: created };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-create', { methods: ['POST'], authLevel: 'anonymous', route: 'posts', handler });
