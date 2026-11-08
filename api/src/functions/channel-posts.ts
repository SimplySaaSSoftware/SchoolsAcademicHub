import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, insertItem, upsertItem, deleteItemById } from '../lib/db';
import { requireAuth, requireRole, errorResponse, HttpError, effectiveSchoolId } from '../lib/middleware';
import { ChannelPostDoc, ChannelPostTranslation, Lang } from '../types';
import { isLang } from '../lib/translation';
import { randomUUID, createHash } from 'crypto';

// GET  /channel-posts?channel_id=&school_id=&lang=
// POST /channel-posts
// PUT  /channel-posts/:id
// DELETE /channel-posts/:id
// PUT  /channel-posts/:id/translate    (save/update translation)
// PUT  /channel-posts/:id/verify-translation

function sourceHash(post: ChannelPostDoc): string {
  return createHash('sha1').update(JSON.stringify({ t: post.title, c: post.content_html })).digest('hex');
}

function localizePost(post: ChannelPostDoc, lang: Lang | null): Record<string, unknown> {
  const { translations: _t, ...rest } = post;
  const orig = post.lang ?? 'en';
  const t = lang && lang !== orig ? post.translations?.[lang] : undefined;
  const isPublic = t && t.status === 'verified' && !t.stale;
  const use = isPublic ? lang! : orig;
  const out: Record<string, unknown> = { ...rest, lang: use, original_lang: orig };
  if (isPublic && t) {
    out.title = t.title;
    out.content_html = t.content_html;
  }
  out.available_langs = isPublic ? [orig, lang!] : [orig];
  return out;
}

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    const isStaff = ['teacher', 'admin', 'super_admin'].includes(jwt.role);

    // ── GET list ──────────────────────────────────────────────────────
    if (req.method === 'GET' && !req.params.id) {
      const schoolId = req.query.get('school_id') ?? jwt.school_id;
      const channelId = req.query.get('channel_id');
      const lang = req.query.get('lang');

      let rows: { data: ChannelPostDoc }[];
      if (channelId) {
        rows = await sql<{ data: ChannelPostDoc }[]>`
          SELECT data FROM items
          WHERE school_id = ${schoolId} AND type = 'channel_post' AND data->>'channel_id' = ${channelId}
          ${!isStaff ? sql`AND data->>'status' = 'published'` : sql``}
          ORDER BY created_at DESC`;
      } else {
        rows = await sql<{ data: ChannelPostDoc }[]>`
          SELECT data FROM items
          WHERE school_id = ${schoolId} AND type = 'channel_post'
          ${!isStaff ? sql`AND data->>'status' = 'published'` : sql``}
          ORDER BY created_at DESC`;
      }

      const posts = rows.map((r) => isStaff ? r.data : localizePost(r.data, isLang(lang) ? lang : null));
      return { jsonBody: posts };
    }

    // ── GET single ────────────────────────────────────────────────────
    if (req.method === 'GET' && req.params.id) {
      const id = req.params.id;
      const rows = await sql<{ data: ChannelPostDoc }[]>`SELECT data FROM items WHERE id = ${id} AND type = 'channel_post'`;
      if (!rows.length) throw new HttpError(404, 'Post not found');
      const post = rows[0].data;
      if (post.school_id !== jwt.school_id && jwt.role !== 'super_admin') throw new HttpError(403, 'Forbidden');
      if (!isStaff && post.status !== 'published') throw new HttpError(404, 'Post not found');
      const lang = req.query.get('lang');
      return { jsonBody: isStaff ? post : localizePost(post, isLang(lang) ? lang : null) };
    }

    // ── Writes: staff only ─────────────────────────────────────────────
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);
    const schoolId = effectiveSchoolId(req, jwt);

    if (req.method === 'POST') {
      const body = await req.json() as Partial<ChannelPostDoc>;
      if (!body.channel_id || !body.title?.trim()) throw new HttpError(400, 'channel_id and title are required');
      const now = new Date().toISOString();
      const post: ChannelPostDoc = {
        id:               randomUUID(),
        school_id:        schoolId,
        type:             'channel_post',
        channel_id:       body.channel_id,
        title:            body.title.trim(),
        content_html:     body.content_html ?? '',
        attachments_json: body.attachments_json ?? '[]',
        event_id:         body.event_id ?? null,
        lang:             isLang(body.lang) ? body.lang : 'en',
        status:           body.status ?? 'draft',
        author_id:        jwt.user_id,
        author_name:      jwt.name ?? jwt.user_id,
        created_at:       now,
        updated_at:       now,
      };
      return { status: 201, jsonBody: await insertItem(post) };
    }

    if (req.method === 'PUT') {
      const id = req.params.id;
      if (!id) throw new HttpError(400, 'id required');

      // Translation endpoints
      const action = req.params.action;

      const rows = await sql<{ data: ChannelPostDoc }[]>`SELECT data FROM items WHERE id = ${id} AND school_id = ${schoolId} AND type = 'channel_post'`;
      if (!rows.length) throw new HttpError(404, 'Post not found');
      const post = rows[0].data;

      if (action === 'translate') {
        const body = await req.json() as { lang: Lang; title: string; content_html: string };
        if (!isLang(body.lang)) throw new HttpError(400, 'Invalid lang');
        if (body.lang === post.lang) throw new HttpError(400, 'Cannot translate to the original language');
        const now = new Date().toISOString();
        const hash = sourceHash(post);
        const existing = post.translations?.[body.lang];
        const tr: ChannelPostTranslation = {
          title:        body.title ?? '',
          content_html: body.content_html ?? '',
          status:       'draft',
          stale:        hash !== (existing?.source_hash ?? hash),
          source_hash:  hash,
          updated_at:   now,
        };
        const updated: ChannelPostDoc = {
          ...post,
          updated_at: now,
          translations: { ...post.translations, [body.lang]: tr },
        };
        return { jsonBody: await upsertItem(updated) };
      }

      if (action === 'verify-translation') {
        const body = await req.json() as { lang: Lang };
        if (!isLang(body.lang)) throw new HttpError(400, 'Invalid lang');
        const tr = post.translations?.[body.lang];
        if (!tr) throw new HttpError(404, 'Translation not found');
        const now = new Date().toISOString();
        const updated: ChannelPostDoc = {
          ...post,
          updated_at: now,
          translations: {
            ...post.translations,
            [body.lang]: { ...tr, status: 'verified', stale: false, source_hash: sourceHash(post), verified_by_id: jwt.user_id, verified_by_name: jwt.name, verified_at: now },
          },
        };
        return { jsonBody: await upsertItem(updated) };
      }

      // Regular update
      const body = await req.json() as Partial<ChannelPostDoc>;
      const now = new Date().toISOString();
      const wasHash = sourceHash(post);
      const updated: ChannelPostDoc = {
        ...post,
        title:            body.title?.trim() ?? post.title,
        content_html:     body.content_html ?? post.content_html,
        attachments_json: body.attachments_json ?? post.attachments_json,
        event_id:         body.event_id !== undefined ? body.event_id : post.event_id,
        status:           body.status ?? post.status,
        updated_at:       now,
      };
      // Mark translation stale if text changed
      const newHash = sourceHash(updated);
      if (newHash !== wasHash && updated.translations) {
        for (const lang of Object.keys(updated.translations) as Lang[]) {
          const tr = updated.translations[lang];
          if (tr) tr.stale = tr.source_hash !== newHash;
        }
      }
      return { jsonBody: await upsertItem(updated) };
    }

    if (req.method === 'DELETE') {
      const id = req.params.id;
      const rows = await sql<{ data: ChannelPostDoc }[]>`SELECT data FROM items WHERE id = ${id} AND school_id = ${schoolId} AND type = 'channel_post'`;
      if (!rows.length) throw new HttpError(404, 'Post not found');
      await deleteItemById(id);
      return { status: 204, body: null };
    }

    throw new HttpError(405, 'Method not allowed');
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('channel-posts-list',               { methods: ['GET'],    authLevel: 'anonymous', route: 'channel-posts',                       handler });
app.http('channel-posts-get',                { methods: ['GET'],    authLevel: 'anonymous', route: 'channel-posts/{id}',                   handler });
app.http('channel-posts-create',             { methods: ['POST'],   authLevel: 'anonymous', route: 'channel-posts',                       handler });
app.http('channel-posts-update',             { methods: ['PUT'],    authLevel: 'anonymous', route: 'channel-posts/{id}',                   handler });
app.http('channel-posts-translate',          { methods: ['PUT'],    authLevel: 'anonymous', route: 'channel-posts/{id}/{action}',          handler });
app.http('channel-posts-delete',             { methods: ['DELETE'], authLevel: 'anonymous', route: 'channel-posts/{id}',                   handler });
