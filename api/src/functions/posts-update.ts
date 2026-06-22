import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getItem, upsertItem } from '../lib/cosmos';
import { requireAuth, requireRole, requireSchoolMatch, errorResponse, HttpError } from '../lib/middleware';
import { PostDoc, AuditEntry } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt  = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);

    const id   = req.params.id;
    const post = await getItem<PostDoc>(id, jwt.school_id);
    if (!post) throw new HttpError(404, 'Post not found');
    requireSchoolMatch(jwt, post.school_id);

    const body    = await req.json() as Partial<PostDoc>;
    const now     = new Date().toISOString();
    const changed: string[] = [];

    const fields: (keyof PostDoc)[] = ['title', 'grade', 'subject', 'term', 'content_html', 'attachments_json', 'quiz_json'];
    fields.forEach((f) => { if (body[f] !== undefined && body[f] !== post[f]) changed.push(f); });

    const auditEntries: AuditEntry[] = [...post.audit];

    if (changed.length > 0) {
      auditEntries.push({ action: 'updated', user_id: jwt.user_id, user_name: jwt.name ?? jwt.user_id, user_role: jwt.role, timestamp: now, changes: changed });
    }

    let publishedFields = {};
    if (body.status && body.status !== post.status) {
      auditEntries.push({ action: 'status_changed', user_id: jwt.user_id, user_name: jwt.name ?? jwt.user_id, user_role: jwt.role, timestamp: now, from: post.status, to: body.status });
      if (body.status === 'published' && !post.published_at) {
        publishedFields = { published_at: now, published_by_id: jwt.user_id, published_by_name: jwt.name };
      }
    }

    const updated: PostDoc = {
      ...post,
      title:            body.title            ?? post.title,
      grade:            body.grade !== undefined ? Number(body.grade) : post.grade,
      subject:          body.subject           ?? post.subject,
      term:             body.term              ?? post.term,
      content_html:     body.content_html      ?? post.content_html,
      attachments_json: body.attachments_json  ?? post.attachments_json,
      quiz_json:        body.quiz_json         ?? post.quiz_json,
      status:           body.status            ?? post.status,
      updated_at:       now,
      updated_by_id:    jwt.user_id,
      updated_by_name:  jwt.name,
      ...publishedFields,
      audit: auditEntries,
    };

    const result = await upsertItem<PostDoc>(updated);
    return { jsonBody: result };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-update', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'posts/{id}',
  handler,
});
