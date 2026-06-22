import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, getSchoolBySlug } from '../lib/db';
import { verifyPin, verifyPassword, signToken, studentExpiry } from '../lib/auth';
import { errorResponse, HttpError } from '../lib/middleware';
import { PinDoc, UserDoc, SchoolDoc } from '../types';

const SUPER_EMAIL = process.env.SUPER_ADMIN_EMAIL!;
const SUPER_HASH  = process.env.SUPER_ADMIN_PASSWORD_HASH!;

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const body = await req.json() as { slug?: string; pin?: string; email?: string; password?: string };

    // Super admin
    if (body.email === SUPER_EMAIL) {
      if (!body.password) throw new HttpError(400, 'Password required');
      if (!(await verifyPassword(body.password, SUPER_HASH))) throw new HttpError(401, 'Invalid credentials');
      const token = signToken({ school_id: 'system', user_id: 'super_admin', role: 'super_admin', name: 'Super Admin' });
      return { jsonBody: { token, role: 'super_admin', name: 'Super Admin' } };
    }

    if (!body.slug) throw new HttpError(400, 'School slug required');
    const school: SchoolDoc = await getSchoolBySlug(body.slug);
    if (!school || !school.active) throw new HttpError(404, 'School not found');

    // PIN login
    if (school.auth_mode === 'pin' || body.pin) {
      if (!body.pin) throw new HttpError(400, 'PIN required');
      const rows = await sql<{ data: PinDoc }[]>`
        SELECT data FROM items WHERE school_id = ${school.school_id} AND type = 'pin'`;
      for (const row of rows) {
        const p = row.data;
        if (await verifyPin(body.pin, p.pin_hash)) {
          const token = signToken(
            { school_id: school.school_id, user_id: p.id, role: p.role, grade: p.grade, name: p.label },
            studentExpiry(p.role)
          );
          return { jsonBody: buildResponse(token, p.role, p.grade, p.label, school) };
        }
      }
      throw new HttpError(401, 'Invalid PIN');
    }

    // Email / password login
    if (!body.email || !body.password) throw new HttpError(400, 'Email and password required');
    const rows = await sql<{ data: UserDoc }[]>`
      SELECT data FROM items
      WHERE school_id = ${school.school_id} AND type = 'user'
        AND data->>'email' = ${body.email.toLowerCase().trim()}
        AND (data->>'active')::boolean = true`;
    const user = rows[0]?.data;
    if (!user) throw new HttpError(401, 'Invalid credentials');
    if (!(await verifyPassword(body.password, user.password_hash))) throw new HttpError(401, 'Invalid credentials');

    const token = signToken(
      { school_id: school.school_id, user_id: user.id, role: user.role, grade: user.grade, name: user.name },
      studentExpiry(user.role)
    );
    return { jsonBody: buildResponse(token, user.role, user.grade, user.name, school) };

  } catch (err) {
    return errorResponse(err);
  }
}

function buildResponse(token: string, role: any, grade: number | undefined, name: string | undefined, school: SchoolDoc) {
  return {
    token, role, grade, name,
    school: { slug: school.slug, name: school.name, logo_url: school.logo_url, primary_colour: school.primary_colour, auth_mode: school.auth_mode, student_auth: school.student_auth, grades: school.grades },
  };
}

app.http('auth-login', { methods: ['POST'], authLevel: 'anonymous', route: 'auth/login', handler });
