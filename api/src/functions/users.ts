import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, insertItem, updateItemById, deleteItemById } from '../lib/db';
import { requireAuth, requireRole, errorResponse, HttpError, effectiveSchoolId } from '../lib/middleware';
import { hashPassword } from '../lib/auth';
import { UserDoc } from '../types';
import { randomUUID } from 'crypto';

function cleanSubjects(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.map((s) => String(s).trim()).filter(Boolean))] : [];
}

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['admin', 'super_admin']);

    if (req.method === 'GET') {
      const schoolId = effectiveSchoolId(req, jwt);
      const rows = await sql<{ data: UserDoc }[]>`
        SELECT data FROM items WHERE school_id = ${schoolId} AND type = 'user'
        ORDER BY data->>'name' ASC`;
      return { jsonBody: rows.map(({ data: u }) => ({ id: u.id, role: u.role, email: u.email, name: u.name, grade: u.grade, subjects: u.subjects ?? [], active: u.active, created_at: u.created_at })) };
    }

    if (req.method === 'POST') {
      const body = await req.json() as { email: string; name: string; role: string; grade?: number; subjects?: string[]; password: string; slug?: string };
      if (!body.email || !body.name || !body.role || !body.password) throw new HttpError(400, 'email, name, role, and password required');
      if (body.password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
      const schoolId = jwt.role === 'super_admin' ? (body.slug ?? effectiveSchoolId(req, jwt)) : effectiveSchoolId(req, jwt);
      if (!schoolId || schoolId === 'system') throw new HttpError(400, 'slug required when creating user as super admin');

      const email = body.email.toLowerCase().trim();
      const dupes = await sql<{ id: string }[]>`
        SELECT id FROM items WHERE school_id = ${schoolId} AND type = 'user' AND data->>'email' = ${email}`;
      if (dupes.length > 0) throw new HttpError(409, 'A user with this email already exists in this school');

      const doc: UserDoc = {
        id:            randomUUID(),
        school_id:     schoolId,
        type:          'user',
        role:          body.role as UserDoc['role'],
        email,
        password_hash: await hashPassword(body.password),
        name:          body.name.trim(),
        grade:         body.grade ? Number(body.grade) : undefined,
        subjects:      cleanSubjects(body.subjects),
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
      if (body.subjects !== undefined) updates.subjects = cleanSubjects(body.subjects);
      if (body.active !== undefined) updates.active = body.active;
      if (body.password) {
        if (body.password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
        updates.password_hash = await hashPassword(body.password);
      }
      const schoolId = effectiveSchoolId(req, jwt);
      await updateItemById<UserDoc>(req.params.id, schoolId, 'user', updates);
      return { jsonBody: { ok: true } };
    }

    if (req.method === 'DELETE') {
      const schoolId = effectiveSchoolId(req, jwt);
      const hardDelete = req.query.get('hard') === 'true';
      if (hardDelete) {
        // Verify the user belongs to this school before deleting
        const rows = await sql<{ data: UserDoc }[]>`
          SELECT data FROM items WHERE id = ${req.params.id} AND school_id = ${schoolId} AND type = 'user'`;
        if (!rows[0]) throw new HttpError(404, 'User not found');
        await deleteItemById(req.params.id);
      } else {
        await updateItemById<UserDoc>(req.params.id, schoolId, 'user', { active: false });
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
