import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, insertItem, updateItemById, deleteItemById } from '../lib/db';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';
import { hashPassword } from '../lib/auth';
import { UserDoc } from '../types';
import { randomUUID } from 'crypto';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['admin', 'super_admin']);

    if (req.method === 'GET') {
      const rows = await sql<{ data: UserDoc }[]>`
        SELECT data FROM items WHERE school_id = ${jwt.school_id} AND type = 'user'
        ORDER BY data->>'name' ASC`;
      return { jsonBody: rows.map(({ data: u }) => ({ id: u.id, role: u.role, email: u.email, name: u.name, grade: u.grade, active: u.active, created_at: u.created_at })) };
    }

    if (req.method === 'POST') {
      const body = await req.json() as { email: string; name: string; role: string; grade?: number; password: string; slug?: string };
      if (!body.email || !body.name || !body.role || !body.password) throw new HttpError(400, 'email, name, role, and password required');
      if (body.password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
      const schoolId = jwt.role === 'super_admin' ? (body.slug ?? jwt.school_id) : jwt.school_id;
      if (!schoolId || schoolId === 'system') throw new HttpError(400, 'slug required when creating user as super admin');

      const doc: UserDoc = {
        id:            randomUUID(),
        school_id:     schoolId,
        type:          'user',
        role:          body.role as UserDoc['role'],
        email:         body.email.toLowerCase().trim(),
        password_hash: await hashPassword(body.password),
        name:          body.name.trim(),
        grade:         body.grade ? Number(body.grade) : undefined,
        active:        true,
        created_at:    new Date().toISOString(),
      };
      await insertItem(doc);
      const { password_hash, ...safe } = doc;
      return { status: 201, jsonBody: safe };
    }

    if (req.method === 'PUT') {
      const body = await req.json() as Partial<UserDoc> & { password?: string };
      const updates: Partial<UserDoc> = {};
      if (body.name)             updates.name   = body.name.trim();
      if (body.grade)            updates.grade  = Number(body.grade);
      if (body.active !== undefined) updates.active = body.active;
      if (body.password) {
        if (body.password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
        updates.password_hash = await hashPassword(body.password);
      }
      await updateItemById<UserDoc>(req.params.id, jwt.school_id, 'user', updates);
      return { jsonBody: { ok: true } };
    }

    if (req.method === 'DELETE') {
      const hardDelete = req.query.get('hard') === 'true';
      if (hardDelete) {
        // Verify the user belongs to this school before deleting
        const rows = await sql<{ data: UserDoc }[]>`
          SELECT data FROM items WHERE id = ${req.params.id} AND school_id = ${jwt.school_id} AND type = 'user'`;
        if (!rows[0]) throw new HttpError(404, 'User not found');
        await deleteItemById(req.params.id);
      } else {
        await updateItemById<UserDoc>(req.params.id, jwt.school_id, 'user', { active: false });
      }
      return { status: 204 };
    }

    return { status: 405 };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('users',       { methods: ['GET', 'POST'],   authLevel: 'anonymous', route: 'users',      handler });
app.http('users-by-id', { methods: ['PUT', 'DELETE'], authLevel: 'anonymous', route: 'users/{id}', handler });
