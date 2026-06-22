import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { queryItems, createItem, updateItem, deleteItem } from '../lib/cosmos';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';
import { hashPassword } from '../lib/auth';
import { UserDoc } from '../types';
import { randomUUID } from 'crypto';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['admin', 'super_admin']);

    if (req.method === 'GET') {
      const users = await queryItems<UserDoc>(
        { query: 'SELECT c.id, c.role, c.email, c.name, c.grade, c.active, c.created_at FROM c WHERE c.school_id = @sid AND c.type = @type ORDER BY c.name ASC', parameters: [{ name: '@sid', value: jwt.school_id }, { name: '@type', value: 'user' }] },
        jwt.school_id
      );
      return { jsonBody: users };
    }

    if (req.method === 'POST') {
      const body = await req.json() as { email: string; name: string; role: string; grade?: number; password: string };
      if (!body.email || !body.name || !body.role || !body.password) throw new HttpError(400, 'email, name, role, and password required');
      if (body.password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

      const hash: string = await hashPassword(body.password);
      const doc: UserDoc = {
        id:            randomUUID(),
        school_id:     jwt.school_id,
        type:          'user',
        role:          body.role as UserDoc['role'],
        email:         body.email.toLowerCase().trim(),
        password_hash: hash,
        name:          body.name.trim(),
        grade:         body.grade ? Number(body.grade) : undefined,
        active:        true,
        created_at:    new Date().toISOString(),
      };
      await createItem(doc);
      const { password_hash, ...safe } = doc;
      return { status: 201, jsonBody: safe };
    }

    if (req.method === 'PUT') {
      const body = await req.json() as Partial<UserDoc> & { password?: string };
      const updates: Partial<UserDoc> = {};
      if (body.name)    updates.name   = body.name.trim();
      if (body.grade)   updates.grade  = Number(body.grade);
      if (body.active !== undefined) updates.active = body.active;
      if (body.password) {
        if (body.password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
        updates.password_hash = await hashPassword(body.password);
      }
      await updateItem(req.params.id, jwt.school_id, updates);
      return { jsonBody: { ok: true } };
    }

    if (req.method === 'DELETE') {
      await updateItem(req.params.id, jwt.school_id, { active: false });
      return { status: 204 };
    }

    return { status: 405 };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('users',        { methods: ['GET', 'POST'],  authLevel: 'anonymous', route: 'users',       handler });
app.http('users-by-id',  { methods: ['PUT', 'DELETE'], authLevel: 'anonymous', route: 'users/{id}',  handler });
