import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, insertItem, deleteItemById } from '../lib/db';
import { requireAuth, requireRole, errorResponse, HttpError, effectiveSchoolId } from '../lib/middleware';
import { hashPin, pinLookup } from '../lib/auth';
import { PinDoc } from '../types';
import { randomUUID } from 'crypto';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['admin', 'super_admin']);
    const schoolId = effectiveSchoolId(req, jwt);

    if (req.method === 'GET') {
      const rows = await sql<{ data: PinDoc }[]>`
        SELECT data FROM items WHERE school_id = ${schoolId} AND type = 'pin'`;
      return { jsonBody: rows.map(({ data: p }) => ({ id: p.id, role: p.role, grade: p.grade, label: p.label, subjects: p.subjects ?? [] })) };
    }

    if (req.method === 'POST') {
      const body = await req.json() as { role: string; grade?: number; pin: string; label: string; subjects?: string[] };
      if (!body.role || !body.pin || !body.label) throw new HttpError(400, 'role, pin, and label required');
      if (!/^\d{4,8}$/.test(body.pin)) throw new HttpError(400, 'PIN must be 4-8 digits');

      const clash = await sql<{ id: string }[]>`
        SELECT id FROM items WHERE school_id = ${schoolId} AND type = 'student' AND data->>'pin_lookup' = ${pinLookup(body.pin)}`;
      if (clash.length > 0) throw new HttpError(409, 'That PIN is already used by a student. Choose a different one.');

      const doc: PinDoc = {
        id:         randomUUID(),
        school_id:  schoolId,
        type:       'pin',
        role:       body.role as PinDoc['role'],
        grade:      body.grade ? Number(body.grade) : undefined,
        pin_hash:   await hashPin(body.pin),
        label:      body.label.trim(),
        subjects:   Array.isArray(body.subjects) ? [...new Set(body.subjects.map((s) => String(s).trim()).filter(Boolean))] : [],
        created_at: new Date().toISOString(),
      };
      await insertItem(doc);
      return { status: 201, jsonBody: { id: doc.id, role: doc.role, grade: doc.grade, label: doc.label } };
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

app.http('pins',        { methods: ['GET', 'POST'], authLevel: 'anonymous', route: 'pins',       handler });
app.http('pins-delete', { methods: ['DELETE'],       authLevel: 'anonymous', route: 'pins/{id}',  handler });
