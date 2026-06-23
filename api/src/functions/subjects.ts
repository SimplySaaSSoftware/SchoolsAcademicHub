import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, insertItem, deleteItemById } from '../lib/db';
import { requireAuth, requireRole, errorResponse, effectiveSchoolId } from '../lib/middleware';
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
      return { jsonBody: rows.map((r) => r.data.name) };
    }

    requireRole(jwt, ['admin', 'super_admin']);

    if (req.method === 'POST') {
      const { name } = await req.json() as { name: string };
      if (!name?.trim()) return { status: 400, jsonBody: { error: 'name required' } };
      const doc: SubjectDoc = { id: randomUUID(), school_id: schoolId, type: 'subject', name: name.trim(), created_at: new Date().toISOString() };
      await insertItem(doc);
      return { status: 201, jsonBody: doc };
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
app.http('subjects-delete', { methods: ['DELETE'],       authLevel: 'anonymous', route: 'subjects/{id}',  handler });
