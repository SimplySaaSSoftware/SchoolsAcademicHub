import { createHash } from 'crypto';
import { Lang, PostDoc, Translation } from '../types';

export const LANGS: Lang[] = ['en', 'af'];
export const LANG_NAMES: Record<Lang, string> = { en: 'English', af: 'Afrikaans' };

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'af';
export const originalLang = (p: { lang?: Lang }): Lang => p.lang ?? 'en';
export const otherLang = (l: Lang): Lang => (l === 'en' ? 'af' : 'en');

export function parseQuiz(json: string | undefined): Array<{ question: string; options: string[]; correct_index: number }> {
  try { const q = JSON.parse(json || '[]'); return Array.isArray(q) ? q : []; } catch { return []; }
}

/** Hash of the translatable text of the original. correct_index is deliberately excluded. */
export function sourceHash(p: { title: string; content_html: string; quiz_json: string }): string {
  const quiz = parseQuiz(p.quiz_json).map((q) => ({ q: q.question, o: q.options }));
  return createHash('sha1').update(JSON.stringify({ t: p.title, c: p.content_html, q: quiz })).digest('hex');
}

/** Recompute `stale` on every translation after the original changed. Mutates the post. */
export function refreshStale(post: PostDoc): void {
  const h = sourceHash(post);
  for (const t of Object.values(post.translations ?? {})) {
    if (t) t.stale = t.source_hash !== h;
  }
}

/** True when students may see this translation. */
export const isPublicTranslation = (t?: Translation): t is Translation =>
  !!t && t.status === 'verified' && !t.stale;

export function availableLangs(post: PostDoc): Lang[] {
  const orig = originalLang(post);
  const other = otherLang(orig);
  return isPublicTranslation(post.translations?.[other]) ? [orig, other] : [orig];
}

export function translationState(t?: Translation): 'none' | 'draft' | 'verified' | 'stale' {
  if (!t) return 'none';
  if (t.stale) return 'stale';
  return t.status;
}

/** Quiz questions in the served language. correct_index always comes from the original quiz. */
export function quizForLang(post: PostDoc, lang: Lang | null) {
  const orig = originalLang(post);
  const t = lang && lang !== orig && availableLangs(post).includes(lang) ? post.translations![lang] : undefined;
  return parseQuiz(post.quiz_json).map((q, i) => ({
    ...q,
    question: t?.quiz[i]?.question ?? q.question,
    options:  q.options.map((o, oi) => t?.quiz[i]?.options?.[oi] ?? o),
  }));
}

/** Student-facing view: verified translation text overlaid on the original. Never includes correct answers. */
export function localizePost(post: PostDoc, lang: Lang | null): Record<string, unknown> {
  const { audit, translations, ...rest } = post;
  const orig = originalLang(post);
  const available = availableLangs(post);
  const use = lang && lang !== orig && available.includes(lang) ? lang : orig;
  const out: Record<string, unknown> = { ...rest, lang: use, original_lang: orig, available_langs: available };
  if (use !== orig) {
    const t = translations![use]!;
    out.title = t.title;
    out.content_html = t.content_html;
  }
  // Students get questions and options only: grading happens on the server
  out.quiz_json = JSON.stringify(quizForLang(post, use).map(({ question, options }) => ({ question, options })));
  return out;
}
