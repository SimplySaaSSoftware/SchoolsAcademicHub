import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getItemById } from '../lib/db';
import { localizePost, isLang, originalLang, otherLang, translationState } from '../lib/translation';
import { requireAuth, requireSchoolMatch, errorResponse, HttpError, assertPostAccess } from '../lib/middleware';
import { PostDoc } from '../types';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt  = requireAuth(req);
    const post = await getItemById<PostDoc>(req.params.id);
    if (!post) throw new HttpError(404, 'Post not found');
    await assertPostAccess(jwt, post);
    if (jwt.role === 'student' && post.status !== 'published') throw new HttpError(404, 'Post not found');
    if (jwt.role === 'student') {
      const lang = req.query.get('lang');
      return { jsonBody: localizePost(post, isLang(lang) ? lang : null) };
    }
    // Staff: full post plus per-language state ('none' | 'draft' | 'verified' | 'stale')
    const orig = originalLang(post);
    const other = otherLang(orig);
    return { jsonBody: { ...post, lang: orig, translation_state: { [other]: translationState(post.translations?.[other]) } } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-get', { methods: ['GET'], authLevel: 'anonymous', route: 'posts/{id}', handler });
