import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, insertItem, deleteItemById, updateItemById } from '../lib/db';
import { requireAuth, requireRole, errorResponse, effectiveSchoolId, teacherSubjects, HttpError } from '../lib/middleware';
import { SubjectDoc } from '../types';
import { randomUUID } from 'crypto';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    const schoolId = effectiveSchoolId(req, jwt);

    if (req.method === 'GET') {
      const rows = await sql<{ data: SubjectDoc }[]>`
        SELECT data FROM items WHERE school_id = ${schoolId} AND type = 'subject'
        ORDER BY data->>'name' ASC`;
      // ?full=1 → objects with both display names (admin screens); default → plain names (editor dropdowns)
      if (req.query.get('full') === '1') {
        return { jsonBody: rows.map(({ data: d }) => ({ id: d.id, name: d.name, names: { en: d.names?.en?.trim() || d.name, af: d.names?.af?.trim() || '' } })) };
      }
      const names = rows.map((r) => r.data.name);
      const allowed = await teacherSubjects(jwt);
      return { jsonBody: allowed ? names.filter((n) => allowed.includes(n)) : names };
    }

    requireRole(jwt, ['admin', 'super_admin']);

    if (req.method === 'POST') {
      const { name, name_af } = await req.json() as { name: string; name_af?: string };
      if (!name?.trim()) return { status: 400, jsonBody: { error: 'English name required' } };
      if (!name_af?.trim()) return { status: 400, jsonBody: { error: 'Afrikaans name required' } };
      const doc: SubjectDoc = {
        id: randomUUID(), school_id: schoolId, type: 'subject', name: name.trim(),
        names: { en: name.trim(), af: name_af.trim() }, created_at: new Date().toISOString(),
      };
      await insertItem(doc);
      return { status: 201, jsonBody: doc };
    }

    // PUT /subjects/{id} { name_en?, name_af } — the stored name (used by posts) never changes, only how it is displayed
    if (req.method === 'PUT') {
      const body = await req.json() as { name_en?: string; name_af?: string };
      const existing = await sql<{ data: SubjectDoc }[]>`SELECT data FROM items WHERE id = ${req.params.id} AND school_id = ${schoolId} AND type = 'subject'`;
      const cur = existing[0]?.data;
      if (!cur) throw new HttpError(404, 'Subject not found');
      const names = { en: body.name_en?.trim() || cur.names?.en || cur.name, af: body.name_af?.trim() ?? cur.names?.af ?? '' };
      if (!names.af) throw new HttpError(400, 'Afrikaans name required');
      await updateItemById<SubjectDoc>(cur.id, schoolId, 'subject', { names });
      return { jsonBody: { ok: true } };
    }

    if (req.method === 'DELETE') {
      await deleteItemById(req.params.id);
      return { status: 204 };
    }

    return { status: 405 };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('subjects',        { methods: ['GET', 'POST'], authLevel: 'anonymous', route: 'subjects',       handler });
app.http('subjects-by-id',  { methods: ['PUT', 'DELETE'], authLevel: 'anonymous', route: 'subjects/{id}',  handler });
