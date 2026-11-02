import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getItemById, upsertItem } from '../lib/db';
import { requireAuth, requireRole, errorResponse, HttpError, assertPostAccess } from '../lib/middleware';
import { PostDoc, Translation, Lang } from '../types';
import { aiTranslate } from '../lib/ai-translate';
import { isLang, originalLang, otherLang, parseQuiz, sourceHash, translationState } from '../lib/translation';

async function loadPost(req: HttpRequest) {
  const jwt = requireAuth(req);
  requireRole(jwt, ['teacher', 'admin', 'super_admin']);
  const post = await getItemById<PostDoc>(req.params.id);
  if (!post) throw new HttpError(404, 'Post not found');
  await assertPostAccess(jwt, post);
  return { jwt, post };
}

function targetFor(post: PostDoc, raw: unknown): Lang {
  const target = raw === undefined ? otherLang(originalLang(post)) : raw;
  if (!isLang(target)) throw new HttpError(400, 'target must be "en" or "af"');
  if (target === originalLang(post)) throw new HttpError(400, 'That is already the original language of this post');
  return target;
}

const respond = (post: PostDoc, lang: Lang) => ({
  lang,
  state: translationState(post.translations?.[lang]),
  translation: post.translations?.[lang] ?? null,
});

/** POST /posts/{id}/translate — AI draft of the other language. Never visible to students until verified. */
async function translate(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const { jwt, post } = await loadPost(req);
    const body = await req.json().catch(() => ({})) as { target?: string };
    const target = targetFor(post, body.target);
    const from = originalLang(post);
    const quiz = parseQuiz(post.quiz_json);

    const result = await aiTranslate(
      { title: post.title, content_html: post.content_html, quiz: quiz.map((q) => ({ question: q.question, options: q.options })) },
      from, target,
    );

    const now = new Date().toISOString();
    const t: Translation = {
      ...result,
      status: 'draft', ai_generated: true, stale: false,
      source_hash: sourceHash(post),
      generated_at: now, updated_at: now,
    };
    post.translations = { ...(post.translations ?? {}), [target]: t };
    post.audit = [...post.audit, { action: 'translated', user_id: jwt.user_id, user_name: jwt.name ?? jwt.user_id, user_role: jwt.role, timestamp: now, to: target }];
    await upsertItem<PostDoc>(post);
    return { jsonBody: respond(post, target) };
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT /posts/{id}/translations/{lang} — teacher edits; { verify: true } publishes it to students. */
async function save(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const { jwt, post } = await loadPost(req);
    const target = targetFor(post, req.params.lang);
    const body = await req.json() as { title?: string; content_html?: string; quiz?: Array<{ question: string; options: string[] }>; verify?: boolean };
    if (!body.title?.trim()) throw new HttpError(400, 'title required');

    const orig = parseQuiz(post.quiz_json);
    const quiz = body.quiz ?? [];
    if (quiz.length !== orig.length || quiz.some((q, i) => !Array.isArray(q.options) || q.options.length !== orig[i].options.length)) {
      throw new HttpError(400, 'Translated quiz must have the same questions and answer options as the original');
    }

    const prev = post.translations?.[target];
    const now = new Date().toISOString();
    const verify = body.verify === true;
    const t: Translation = {
      title: body.title.trim(),
      content_html: body.content_html ?? '',
      quiz: quiz.map((q) => ({ question: String(q.question ?? ''), options: q.options.map(String) })),
      status: verify ? 'verified' : 'draft',
      ai_generated: prev?.ai_generated ?? false,
      stale: false,
      source_hash: sourceHash(post),
      generated_at: prev?.generated_at,
      updated_at: now,
      ...(verify ? { verified_by_id: jwt.user_id, verified_by_name: jwt.name ?? jwt.user_id, verified_at: now } : {}),
    };
    post.translations = { ...(post.translations ?? {}), [target]: t };
    if (verify) {
      post.audit = [...post.audit, { action: 'translation_verified', user_id: jwt.user_id, user_name: jwt.name ?? jwt.user_id, user_role: jwt.role, timestamp: now, to: target }];
    }
    await upsertItem<PostDoc>(post);
    return { jsonBody: respond(post, target) };
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /posts/{id}/translations/{lang} */
async function remove(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const { post } = await loadPost(req);
    const target = targetFor(post, req.params.lang);
    if (post.translations?.[target]) {
      const { [target]: _removed, ...rest } = post.translations;
      post.translations = rest;
      await upsertItem<PostDoc>(post);
    }
    return { status: 204 };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-translate',        { methods: ['POST'],   authLevel: 'anonymous', route: 'posts/{id}/translate',          handler: translate });
app.http('posts-translation-save', { methods: ['PUT'],    authLevel: 'anonymous', route: 'posts/{id}/translations/{lang}', handler: save });
app.http('posts-translation-del',  { methods: ['DELETE'], authLevel: 'anonymous', route: 'posts/{id}/translations/{lang}', handler: remove });
