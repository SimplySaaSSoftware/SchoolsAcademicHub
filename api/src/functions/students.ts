import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, insertItem, updateItemById, deleteItemById } from '../lib/db';
import { requireAuth, requireRole, errorResponse, HttpError, effectiveSchoolId } from '../lib/middleware';
import { publicStudent as publicView, usedLookups, uniquePin, makeStudent, cleanName, cleanGrade, cleanSubjectList } from '../lib/students';
import { StudentDoc } from '../types';
import { randomUUID } from 'crypto';

const MAX_IMPORT = 500;

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['admin', 'super_admin', 'teacher']);
    const isTeacher = jwt.role === 'teacher';
    // Class teachers work with their own grade only: list, add, import and reset PINs
    if (isTeacher && !jwt.grade) throw new HttpError(403, 'Your account has no grade assigned');
    const teacherGrade = isTeacher ? Number(jwt.grade) : null;
    const schoolId = effectiveSchoolId(req, jwt);
    if (!schoolId || schoolId === 'system') throw new HttpError(400, 'school required');
    const id = req.params.id;
    const action = req.params.action;

    // GET /students[?grade=]
    if (req.method === 'GET') {
      const grade = isTeacher ? String(teacherGrade) : req.query.get('grade');
      const rows = await sql<{ data: StudentDoc }[]>`
        SELECT data FROM items WHERE school_id = ${schoolId} AND type = 'student'
          AND (${!grade} = true OR data->>'grade' = ${grade ?? ''})
        ORDER BY (data->>'grade')::int ASC, data->>'name' ASC`;
      return { jsonBody: rows.map((r) => publicView(r.data)) };
    }

    // POST /students/import  { students: [{ name, grade }] }
    if (req.method === 'POST' && id === 'import') {
      const body = await req.json() as { students?: Array<{ name?: unknown; grade?: unknown }> };
      const list = body.students ?? [];
      if (!Array.isArray(list) || list.length === 0) throw new HttpError(400, 'students required');
      if (list.length > MAX_IMPORT) throw new HttpError(400, `Import at most ${MAX_IMPORT} students at a time`);
      const used = await usedLookups(schoolId);
      const created: Array<ReturnType<typeof publicView> & { pin: string }> = [];
      for (const s of list) {
        const { pin, lookup } = uniquePin(used);
        const doc = makeStudent(schoolId, cleanName(s.name), teacherGrade ?? cleanGrade(s.grade), lookup);
        await insertItem(doc);
        created.push({ ...publicView(doc), pin });
      }
      return { status: 201, jsonBody: created };
    }

    // POST /students  { name, grade }  -> PIN is shown once
    if (req.method === 'POST' && !id) {
      const body = await req.json() as { name?: unknown; grade?: unknown; subjects?: unknown };
      const { pin, lookup } = uniquePin(await usedLookups(schoolId));
      const doc = makeStudent(schoolId, cleanName(body.name), teacherGrade ?? cleanGrade(body.grade), lookup, cleanSubjectList(body.subjects));
      await insertItem(doc);
      return { status: 201, jsonBody: { ...publicView(doc), pin } };
    }

    // POST /students/{id}/reset-pin
    if (req.method === 'POST' && id && action === 'reset-pin') {
      const { pin, lookup } = uniquePin(await usedLookups(schoolId));
      const existing = await sql<{ g: string }[]>`SELECT data->>'grade' AS g FROM items WHERE id = ${id} AND school_id = ${schoolId} AND type = 'student'`;
      if (!existing[0] || (teacherGrade && Number(existing[0].g) !== teacherGrade)) throw new HttpError(404, 'Student not found');
      await updateItemById<StudentDoc>(id, schoolId, 'student', { pin_lookup: lookup });
      return { jsonBody: { id, pin } };
    }

    if ((req.method === 'PUT' || req.method === 'DELETE') && isTeacher) {
      throw new HttpError(403, 'Only an admin can edit, deactivate or delete students');
    }

    // PUT /students/{id}  { name?, grade?, active? }
    if (req.method === 'PUT' && id) {
      const body = await req.json() as { name?: unknown; grade?: unknown; active?: unknown; subjects?: unknown };
      const updates: Partial<StudentDoc> = {};
      if (body.name !== undefined)   updates.name   = cleanName(body.name);
      if (body.grade !== undefined)  updates.grade  = cleanGrade(body.grade);
      if (body.active !== undefined) updates.active = body.active === true;
      if (body.subjects !== undefined) updates.subjects = cleanSubjectList(body.subjects);
      const existing = await sql<{ id: string }[]>`SELECT id FROM items WHERE id = ${id} AND school_id = ${schoolId} AND type = 'student'`;
      if (!existing[0]) throw new HttpError(404, 'Student not found');
      await updateItemById<StudentDoc>(id, schoolId, 'student', updates);
      return { jsonBody: { ok: true } };
    }

    // DELETE /students/{id}[?hard=true]
    if (req.method === 'DELETE' && id) {
      const existing = await sql<{ id: string }[]>`SELECT id FROM items WHERE id = ${id} AND school_id = ${schoolId} AND type = 'student'`;
      if (!existing[0]) throw new HttpError(404, 'Student not found');
      if (req.query.get('hard') === 'true') await deleteItemById(id);
      else await updateItemById<StudentDoc>(id, schoolId, 'student', { active: false });
      return { status: 204 };
    }

    return { status: 405 };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('students',        { methods: ['GET', 'POST'],               authLevel: 'anonymous', route: 'students',                 handler });
app.http('students-by-id',  { methods: ['PUT', 'DELETE', 'POST'],     authLevel: 'anonymous', route: 'students/{id}',            handler });
app.http('students-action', { methods: ['POST'],                      authLevel: 'anonymous', route: 'students/{id}/{action}',   handler });
