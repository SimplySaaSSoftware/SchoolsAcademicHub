import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql } from '../lib/db';
import { originalLang, otherLang } from '../lib/translation';
import { subjectNameMap, namesFor } from '../lib/subjects';
import { requireAuth, requireSchoolMatch, errorResponse, effectiveSchoolId, teacherSubjects } from '../lib/middleware';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt       = requireAuth(req);
    const school_id = req.query.get('school_id') ?? effectiveSchoolId(req, jwt);
    requireSchoolMatch(jwt, school_id);

    const grade   = req.query.get('grade');
    const subject = req.query.get('subject');
    const term    = req.query.get('term');

    const allowed = await teacherSubjects(jwt);
    const subjectClause = allowed ? sql` AND data->>'subject' IN ${sql(allowed)}` : sql``;

    const rows = await sql<{ data: any; tmeta: Record<string, { title?: string; status?: string; stale?: boolean }> | null }[]>`
      SELECT data - 'audit' - 'content_html' - 'translations' AS data,
             (SELECT jsonb_object_agg(k, jsonb_build_object('title', v->'title', 'status', v->'status', 'stale', v->'stale'))
                FROM jsonb_each(data->'translations') AS t(k, v)) AS tmeta
      FROM items
      WHERE school_id = ${school_id} AND type = 'post'
        AND (${jwt.role === 'student'} = false OR data->>'status' = 'published')
        AND (${jwt.role !== 'student' || !jwt.grade} = true OR data->>'grade' = ${String(jwt.grade ?? '')})
        AND (${jwt.role === 'teacher' && !grade} = false OR data->>'grade' = ${grade ?? String(jwt.grade ?? '')})
        AND (${!grade || jwt.role !== 'teacher'} = true OR data->>'grade' = ${grade ?? ''})
        AND (${!subject} = true OR data->>'subject' = ${subject ?? ''})
        AND (${!term}    = true OR data->>'term'    = ${term ?? ''})${subjectClause}
      ORDER BY data->>'created_at' DESC`;

    // Individual students see their own progress per post (opened, quiz attempts, best score).
    // Shared grade PINs have no personal progress, so they get none.
    type Progress = { opened: boolean; attempts: number; best: number | null; last: number | null; passed: boolean };
    let progress: Map<string, Progress> | null = null;
    if (jwt.role === 'student') {
      const prof = await sql<{ id: string }[]>`SELECT id FROM items WHERE id = ${jwt.user_id} AND school_id = ${school_id} AND type = 'student'`;
      if (prof[0]) {
        const [opens, attempts] = await Promise.all([
          sql<{ post_id: string }[]>`
            SELECT DISTINCT data->>'post_id' AS post_id FROM items
            WHERE school_id = ${school_id} AND type = 'activity' AND data->>'student_id' = ${jwt.user_id}`,
          sql<{ post_id: string; pct: string; ts: string }[]>`
            SELECT data->>'post_id' AS post_id, data->>'percentage' AS pct, data->>'timestamp' AS ts FROM items
            WHERE school_id = ${school_id} AND type = 'quiz_attempt' AND data->>'student_id' = ${jwt.user_id}
            ORDER BY data->>'timestamp' ASC`,
        ]);
        progress = new Map();
        const get = (id: string): Progress => {
          let p = progress!.get(id);
          if (!p) { p = { opened: false, attempts: 0, best: null, last: null, passed: false }; progress!.set(id, p); }
          return p;
        };
        opens.forEach((o) => { get(o.post_id).opened = true; });
        attempts.forEach((a) => {
          const p = get(a.post_id); const pct = Number(a.pct);
          p.opened = true; p.attempts++; p.last = pct; p.best = p.best === null ? pct : Math.max(p.best, pct); p.passed = p.best >= 80;
        });
      }
    }

    const subjectNames = await subjectNameMap(school_id);

    return {
      jsonBody: rows.map(({ data, tmeta }) => {
        const orig = originalLang(data);
        const other = otherLang(orig);
        const t = tmeta?.[other];
        const state = !t ? 'none' : t.stale ? 'stale' : (t.status ?? 'draft');
        const live  = state === 'verified';
        const isStudent = jwt.role === 'student';
        const hasQuiz = (() => { try { return JSON.parse(data.quiz_json || '[]').length > 0; } catch { return false; } })();
        if (isStudent) delete data.quiz_json;   // contains correct answers: students get has_quiz only
        return {
          ...data,
          has_quiz: hasQuiz,
          subject_names: namesFor(subjectNames, data.subject),
          ...(progress ? { progress: progress.get(data.id) ?? { opened: false, attempts: 0, best: null, last: null, passed: false } } : {}),
          lang: orig,
          available_langs: live ? [orig, other] : [orig],
          titles: (live || (t && jwt.role !== 'student')) ? { [orig]: data.title, [other]: t!.title } : { [orig]: data.title },
          translation_state: jwt.role === 'student' ? undefined : { [other]: state },
        };
      }),
    };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('posts-list', { methods: ['GET'], authLevel: 'anonymous', route: 'posts', handler });
