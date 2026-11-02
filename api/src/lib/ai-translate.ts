import { HttpError } from './middleware';
import { Lang } from '../types';
import { LANG_NAMES } from './translation';

const MODEL   = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const CHUNK   = 4000;   // chars of HTML per request, keeps each call well under the ~45s function limit
const TIMEOUT = 40_000;

export interface TranslatablePost {
  title: string;
  content_html: string;
  quiz: Array<{ question: string; options: string[] }>;
}

function systemPrompt(from: Lang, to: Lang, kind: 'html' | 'json'): string {
  return [
    `You are a professional translator of South African school learning material (CAPS curriculum). Translate from ${LANG_NAMES[from]} to ${LANG_NAMES[to]}.`,
    'Write at the same reading level as the source, suitable for school children. Use standard South African usage and CAPS terminology.',
    'Keep every HTML tag, attribute and placeholder token such as {{IMG:3}} exactly as given, in the same position. Translate only visible text.',
    'Never change numbers, maths, formulas, units, URLs or names of people and places. Do not add, remove or reorder anything.',
    kind === 'html'
      ? 'Return ONLY the translated HTML. No commentary, no code fences.'
      : 'Return ONLY a JSON object with exactly the same shape and array lengths as the input. No commentary, no code fences.',
  ].join('\n');
}

async function callClaude(system: string, user: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new HttpError(503, 'AI translation is not configured (missing ANTHROPIC_API_KEY).');
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL(), max_tokens: 8000, system, messages: [{ role: 'user', content: user }] }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch {
    throw new HttpError(504, 'AI translation timed out. Try again, or translate a shorter post.');
  }
  if (!res.ok) {
    console.error('[ai-translate]', res.status, await res.text().catch(() => ''));
    throw new HttpError(502, 'AI translation failed. Please try again.');
  }
  const data = await res.json() as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
  if (!text.trim()) throw new HttpError(502, 'AI returned an empty translation.');
  return text.trim();
}

const stripFences = (s: string) => s.replace(/^```(?:json|html)?\s*/i, '').replace(/\s*```$/, '').trim();

/** Swap <img> tags (often huge base64) for tokens so they cost nothing and cannot be altered. */
function hideImages(html: string, store: string[]): string {
  return html.replace(/<img\b[^>]*>/gi, (m) => { store.push(m); return `{{IMG:${store.length - 1}}}`; });
}
function showImages(html: string, store: string[]): string {
  return html.replace(/\{\{IMG:(\d+)\}\}/g, (_, i) => store[Number(i)] ?? '');
}

function chunkHtml(html: string): string[] {
  const parts = html.split(/(?<=<\/(?:p|h[1-6]|ul|ol|li|blockquote|div|table)>)/i);
  const chunks: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (cur && cur.length + p.length > CHUNK) { chunks.push(cur); cur = ''; }
    cur += p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export async function aiTranslate(src: TranslatablePost, from: Lang, to: Lang): Promise<TranslatablePost> {
  const images: string[] = [];
  const content = hideImages(src.content_html ?? '', images);
  const payload = {
    title: src.title,
    quiz: src.quiz.map((q) => ({ question: hideImages(q.question ?? '', images), options: q.options })),
  };

  const [meta, ...htmlParts] = await Promise.all([
    callClaude(systemPrompt(from, to, 'json'), JSON.stringify(payload)),
    ...chunkHtml(content).map((c) => callClaude(systemPrompt(from, to, 'html'), c)),
  ]);

  let parsed: { title?: string; quiz?: Array<{ question?: string; options?: string[] }> };
  try { parsed = JSON.parse(stripFences(meta)); }
  catch { throw new HttpError(502, 'AI returned an unreadable translation. Please try again.'); }

  const quiz = src.quiz.map((q, i) => {
    const t = parsed.quiz?.[i];
    if (!t || typeof t.question !== 'string' || !Array.isArray(t.options) || t.options.length !== q.options.length) {
      throw new HttpError(502, 'AI changed the quiz structure. Please try again.');
    }
    return { question: showImages(t.question, images), options: t.options.map(String) };
  });
  if (parsed.quiz && parsed.quiz.length !== src.quiz.length) throw new HttpError(502, 'AI changed the quiz structure. Please try again.');

  return {
    title: (parsed.title ?? src.title).trim(),
    content_html: showImages(htmlParts.map(stripFences).join(''), images),
    quiz,
  };
}
