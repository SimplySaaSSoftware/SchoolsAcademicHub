import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { queryItems, createItem, deleteItem } from '../lib/cosmos';
import { requireAuth, requireRole, errorResponse } from '../lib/middleware';
import { SubjectDoc } from '../types';
import { randomUUID } from 'crypto';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);

    if (req.method === 'GET') {
      const items = await queryItems<SubjectDoc>(
        { query: 'SELECT * FROM c WHERE c.school_id = @sid AND c.type = @type ORDER BY c.name ASC', parameters: [{ name: '@sid', value: jwt.school_id }, { name: '@type', value: 'subject' }] },
        jwt.school_id
      );
      return { jsonBody: items.map((s) => s.name) };
    }

    requireRole(jwt, ['admin', 'super_admin']);

    if (req.method === 'POST') {
      const { name } = await req.json() as { name: string };
      if (!name?.trim()) return { status: 400, jsonBody: { error: 'name required' } };
      const doc: SubjectDoc = { id: randomUUID(), school_id: jwt.school_id, type: 'subject', name: name.trim(), created_at: new Date().toISOString() };
      await createItem(doc);
      return { status: 201, jsonBody: doc };
    }

    if (req.method === 'DELETE') {
      await deleteItem(req.params.id, jwt.school_id);
      return { status: 204 };
    }

    return { status: 405 };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('subjects', { methods: ['GET', 'POST'], authLevel: 'anonymous', route: 'subjects', handler });
app.http('subjects-delete', { methods: ['DELETE'], authLevel: 'anonymous', route: 'subjects/{id}', handler });
