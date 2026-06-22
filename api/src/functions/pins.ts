import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { queryItems, createItem, deleteItem } from '../lib/cosmos';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';
import { hashPin } from '../lib/auth';
import { PinDoc } from '../types';
import { randomUUID } from 'crypto';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['admin', 'super_admin']);

    if (req.method === 'GET') {
      const pins = await queryItems<PinDoc>(
        { query: 'SELECT c.id, c.role, c.grade, c.label FROM c WHERE c.school_id = @sid AND c.type = @type', parameters: [{ name: '@sid', value: jwt.school_id }, { name: '@type', value: 'pin' }] },
        jwt.school_id
      );
      return { jsonBody: pins };
    }

    if (req.method === 'POST') {
      const body = await req.json() as { role: string; grade?: number; pin: string; label: string };
      if (!body.role || !body.pin || !body.label) throw new HttpError(400, 'role, pin, and label required');
      if (!/^\d{4,8}$/.test(body.pin)) throw new HttpError(400, 'PIN must be 4–8 digits');

      const doc: PinDoc = {
        id:         randomUUID(),
        school_id:  jwt.school_id,
        type:       'pin',
        role:       body.role as PinDoc['role'],
        grade:      body.grade ? Number(body.grade) : undefined,
        pin_hash:   await hashPin(body.pin),
        label:      body.label.trim(),
        created_at: new Date().toISOString(),
      };
      await createItem(doc);
      return { status: 201, jsonBody: { id: doc.id, role: doc.role, grade: doc.grade, label: doc.label } };
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

app.http('pins',        { methods: ['GET', 'POST'], authLevel: 'anonymous', route: 'pins',       handler });
app.http('pins-delete', { methods: ['DELETE'],       authLevel: 'anonymous', route: 'pins/{id}',  handler });
