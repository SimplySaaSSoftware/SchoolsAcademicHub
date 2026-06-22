import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, insertItem, deleteItemById } from '../lib/db';
import { requireAuth, requireRole, errorResponse } from '../lib/middleware';
import { TermDoc } from '../types';
import { randomUUID } from 'crypto';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);

    if (req.method === 'GET') {
      const rows = await sql<{ data: TermDoc }[]>`
        SELECT data FROM items WHERE school_id = ${jwt.school_id} AND type = 'term'
        ORDER BY data->>'name' ASC`;
      return { jsonBody: rows.map((r) => r.data.name) };
    }

    requireRole(jwt, ['admin', 'super_admin']);

    if (req.method === 'POST') {
      const { name } = await req.json() as { name: string };
      if (!name?.trim()) return { status: 400, jsonBody: { error: 'name required' } };
      const doc: TermDoc = { id: randomUUID(), school_id: jwt.school_id, type: 'term', name: name.trim(), created_at: new Date().toISOString() };
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

app.http('terms',        { methods: ['GET', 'POST'], authLevel: 'anonymous', route: 'terms',       handler });
app.http('terms-delete', { methods: ['DELETE'],       authLevel: 'anonymous', route: 'terms/{id}',  handler });
