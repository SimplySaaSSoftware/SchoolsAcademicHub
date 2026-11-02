import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, insertItem, updateItemById, getSchoolBySlug } from '../lib/db';
import { requireAuth, requireRole, errorResponse, HttpError, effectiveSchoolId, teacherSubjects } from '../lib/middleware';
import { usedLookups, uniquePin, makeStudent } from '../lib/students';
import { buildStudentSheet, parseStudentSheet, planImport, SheetSubject, StudentStats, QuizResultRow, LessonRow } from '../lib/student-sheet';
import { PostDoc, StudentDoc, SubjectDoc } from '../types';

const MAX_ROWS = 1000;
const MAX_BYTES = 5 * 1024 * 1024;
const PASS = 80;

async function context(req: HttpRequest) {
  const jwt = requireAuth(req);
  requireRole(jwt, ['admin', 'super_admin', 'teacher']);
  if (jwt.role === 'teacher' && !jwt.grade) throw new HttpError(403, 'Your account has no grade assigned');
  const schoolId = effectiveSchoolId(req, jwt);
  if (!schoolId || schoolId === 'system') throw new HttpError(400, 'school required');
  return { jwt, schoolId, teacherGrade: jwt.role === 'teacher' ? Number(jwt.grade) : null };
}

async function loadSubjects(schoolId: string): Promise<SheetSubject[]> {
  const rows = await sql<{ data: SubjectDoc }[]>`SELECT data FROM items WHERE school_id = ${schoolId} AND type = 'subject' ORDER BY data->>'name' ASC`;
  return rows.map(({ data: d }) => ({ name: d.name, en: d.names?.en?.trim() || d.name, af: d.names?.af?.trim() || d.name }));
}

async function loadStudents(schoolId: string, grade: number | null): Promise<StudentDoc[]> {
  const rows = await sql<{ data: StudentDoc }[]>`
    SELECT data FROM items WHERE school_id = ${schoolId} AND type = 'student'
      AND (${grade === null} = true OR data->>'grade' = ${String(grade ?? '')})
    ORDER BY (data->>'grade')::int ASC, data->>'name' ASC`;
  return rows.map((r) => r.data);
}

/** GET /student-sheet/export[?grade=] — Excel file: editable Students sheet plus read-only results and lesson stats. */
async function exportSheet(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const { jwt, schoolId, teacherGrade } = await context(req);
    const gradeParam = req.query.get('grade');
    const grade = teacherGrade ?? (gradeParam ? Number(gradeParam) : null);
    const allowed = await teacherSubjects(jwt);            // teachers limited to their subjects see only those lessons

    const [school, subjects, students, postRows, activityRows, attemptRows] = await Promise.all([
      getSchoolBySlug(schoolId),
      loadSubjects(schoolId),
      loadStudents(schoolId, grade),
      sql<{ data: PostDoc }[]>`
        SELECT data - 'content_html' - 'translations' - 'audit' AS data FROM items
        WHERE school_id = ${schoolId} AND type = 'post'
          AND (${grade === null} = true OR data->>'grade' = ${String(grade ?? '')})`,
      sql<{ student_id: string; post_id: string; ts: string }[]>`
        SELECT data->>'student_id' AS student_id, data->>'post_id' AS post_id, data->>'timestamp' AS ts FROM items
        WHERE school_id = ${schoolId} AND type = 'activity'
          AND (${grade === null} = true OR data->>'grade' = ${String(grade ?? '')})`,
      sql<{ student_id: string; post_id: string; pct: string; ts: string }[]>`
        SELECT data->>'student_id' AS student_id, data->>'post_id' AS post_id, data->>'percentage' AS pct, data->>'timestamp' AS ts FROM items
        WHERE school_id = ${schoolId} AND type = 'quiz_attempt'
          AND (${grade === null} = true OR data->>'grade' = ${String(grade ?? '')})`,
    ]);

    const posts = postRows.map((r) => r.data).filter((p) => !allowed || allowed.includes(p.subject));
    const postById = new Map(posts.map((p) => [p.id, p]));
    const studentById = new Map(students.map((s) => [s.id, s]));

    // Per student
    const opened = new Map<string, Set<string>>();
    const best = new Map<string, Map<string, { best: number; last: number; attempts: number; when: string }>>();
    const lastActive = new Map<string, string>();
    const touch = (sid: string, ts: string) => { if (ts && (!lastActive.get(sid) || ts > lastActive.get(sid)!)) lastActive.set(sid, ts); };
    for (const a of activityRows) {
      if (!studentById.has(a.student_id) || !postById.has(a.post_id)) continue;
      if (!opened.has(a.student_id)) opened.set(a.student_id, new Set());
      opened.get(a.student_id)!.add(a.post_id); touch(a.student_id, a.ts);
    }
    for (const a of attemptRows.slice().sort((x, y) => (x.ts ?? '').localeCompare(y.ts ?? ''))) {
      if (!studentById.has(a.student_id) || !postById.has(a.post_id)) continue;
      const pct = Number(a.pct);
      if (!best.has(a.student_id)) best.set(a.student_id, new Map());
      const m = best.get(a.student_id)!;
      const cur = m.get(a.post_id) ?? { best: 0, last: 0, attempts: 0, when: '' };
      m.set(a.post_id, { best: Math.max(cur.best, pct), last: pct, attempts: cur.attempts + 1, when: a.ts });
      if (!opened.has(a.student_id)) opened.set(a.student_id, new Set());
      opened.get(a.student_id)!.add(a.post_id); touch(a.student_id, a.ts);
    }

    const stats = new Map<string, StudentStats>();
    const results: QuizResultRow[] = [];
    for (const s of students) {
      const m = best.get(s.id);
      const bests = m ? [...m.values()].map((v) => v.best) : [];
      stats.set(s.id, {
        opened: opened.get(s.id)?.size ?? 0,
        taken: bests.length,
        passed: bests.filter((b) => b >= PASS).length,
        avg: bests.length ? Math.round(bests.reduce((x, y) => x + y, 0) / bests.length) : null,
        last: lastActive.get(s.id) ?? null,
      });
      m?.forEach((v, postId) => {
        const p = postById.get(postId)!;
        results.push({ student: s.name, grade: s.grade, subject: p.subject, lesson: p.title, attempts: v.attempts, best: v.best, last: v.last, passed: v.best >= PASS, when: v.when });
      });
    }
    results.sort((a, b) => a.grade - b.grade || a.student.localeCompare(b.student) || a.lesson.localeCompare(b.lesson));

    // Per lesson (all students of the grade, including ones not in the list above)
    const viewers = new Map<string, Set<string>>();
    activityRows.forEach((a) => { if (postById.has(a.post_id)) { if (!viewers.has(a.post_id)) viewers.set(a.post_id, new Set()); viewers.get(a.post_id)!.add(a.student_id); } });
    const attemptsByPost = new Map<string, number[]>();
    attemptRows.forEach((a) => { if (postById.has(a.post_id)) attemptsByPost.set(a.post_id, [...(attemptsByPost.get(a.post_id) ?? []), Number(a.pct)]); });
    const lessons: LessonRow[] = posts
      .map((p) => {
        const att = attemptsByPost.get(p.id) ?? [];
        return {
          title: p.title, subject: p.subject, grade: p.grade, term: p.term, status: p.status,
          viewers: viewers.get(p.id)?.size ?? 0, attempts: att.length,
          avg: att.length ? Math.round(att.reduce((x, y) => x + y, 0) / att.length) : null,
          passRate: att.length ? Math.round((att.filter((v) => v >= PASS).length / att.length) * 100) : null,
        };
      })
      .sort((a, b) => a.grade - b.grade || a.subject.localeCompare(b.subject) || a.title.localeCompare(b.title));

    const buffer = await buildStudentSheet({
      schoolName: school?.name ?? schoolId, students, subjects, stats, results, lessons,
      gradeLabel: grade ? `Grade ${grade}` : 'all grades',
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      body: buffer,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="students-${grade ? 'grade-' + grade : 'all'}-${stamp}.xlsx"`,
      },
    };
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST /student-sheet/import[?dry=1] — body is the .xlsx file.
 * dry=1 returns what would change without saving. The real run saves nothing if any row has an error.
 */
async function importSheet(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const { schoolId, teacherGrade } = await context(req);
    const dry = req.query.get('dry') === '1';

    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length === 0) throw new HttpError(400, 'No file received');
    if (buf.length > MAX_BYTES) throw new HttpError(400, 'File is too large (5 MB at most)');

    const subjects = await loadSubjects(schoolId);
    const parsed = await parseStudentSheet(buf, subjects);
    if (parsed.fatal) throw new HttpError(400, parsed.fatal);
    if (parsed.rows.length > MAX_ROWS) throw new HttpError(400, `At most ${MAX_ROWS} students per file`);

    const existing = await loadStudents(schoolId, null);
    const plan = planImport(parsed.rows, existing, { teacherGrade });
    const summary = {
      dry, warnings: parsed.warnings, errors: plan.errors, unchanged: plan.unchanged,
      creates: plan.creates.map((c) => ({ row: c.row, name: c.name, grade: c.grade, subjects: c.subjects })),
      updates: plan.updates.map((u) => ({ row: u.row, name: u.name, grade: u.grade, changes: u.changes })),
    };
    if (dry || plan.errors.length > 0) return { jsonBody: { ...summary, saved: false } };

    // Apply: update existing, create new (each new student gets a PIN, shown once)
    for (const u of plan.updates) {
      await updateItemById<StudentDoc>(u.id, schoolId, 'student', { name: u.name, grade: u.grade, subjects: u.subjects });
    }
    const used = await usedLookups(schoolId);
    const created: Array<{ name: string; grade: number; pin: string }> = [];
    for (const c of plan.creates) {
      const { pin, lookup } = uniquePin(used);
      await insertItem(makeStudent(schoolId, c.name, c.grade, lookup, c.subjects));
      created.push({ name: c.name, grade: c.grade, pin });
    }
    return { jsonBody: { ...summary, saved: true, created } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('student-sheet-export', { methods: ['GET'],  authLevel: 'anonymous', route: 'student-sheet/export', handler: exportSheet });
app.http('student-sheet-import', { methods: ['POST'], authLevel: 'anonymous', route: 'student-sheet/import', handler: importSheet });
