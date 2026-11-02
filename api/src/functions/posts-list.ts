import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql } from '../lib/db';
import { originalLang, otherLang } from '../lib/translation';
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
