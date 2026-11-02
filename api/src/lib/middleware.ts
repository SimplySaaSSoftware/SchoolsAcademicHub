import { HttpRequest } from '@azure/functions';
import { verifyToken } from './auth';
import { JwtPayload, Role } from '../types';
import { sql } from './db';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function requireAuth(req: HttpRequest): JwtPayload {
  const token = req.headers.get('x-auth-token') ?? '';
  if (!token) throw new HttpError(401, 'Missing auth token');
  try {
    return verifyToken(token);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
}

export function requireRole(payload: JwtPayload, roles: Role[]): void {
  if (!roles.includes(payload.role)) {
    throw new HttpError(403, `Requires one of: ${roles.join(', ')}`);
  }
}

export function requireSchoolMatch(payload: JwtPayload, school_id: string): void {
  if (payload.role === 'super_admin') return;
  if (payload.school_id !== school_id) throw new HttpError(403, 'School mismatch');
}

// When super_admin calls from a school admin page, they pass X-School-Id to
// scope queries to a specific school. Regular users always use their own school_id.
export function effectiveSchoolId(req: HttpRequest, jwt: JwtPayload): string {
  if (jwt.role === 'super_admin') {
    const override = req.headers.get('x-school-id');
    if (override) return override;
  }
  return jwt.school_id;
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return { status: err.status, jsonBody: { error: err.message } };
  }
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[500]', msg, err);
  return { status: 500, jsonBody: { error: msg } };
}

/**
 * Subjects a teacher may access, read fresh from the DB (so admin changes apply immediately).
 * Returns null when unrestricted: non-teachers, or teachers with no subjects assigned.
 */
export async function teacherSubjects(jwt: JwtPayload): Promise<string[] | null> {
  if (jwt.role !== 'teacher') return null;
  const rows = await sql<{ subjects: unknown }[]>`
    SELECT data->'subjects' AS subjects FROM items
    WHERE id = ${jwt.user_id} AND school_id = ${jwt.school_id} AND type IN ('user', 'pin')`;
  const s = rows[0]?.subjects;
  return Array.isArray(s) && s.length > 0 ? (s as string[]) : null;
}

/** Throws 404 unless the caller may see/modify a post (school, and for teachers: grade + subject). */
export async function assertPostAccess(
  jwt: JwtPayload,
  post: { school_id: string; grade: number; subject: string },
): Promise<void> {
  requireSchoolMatch(jwt, post.school_id);
  if (jwt.role !== 'teacher') return;
  if (jwt.grade && Number(post.grade) !== Number(jwt.grade)) throw new HttpError(404, 'Post not found');
  const subjects = await teacherSubjects(jwt);
  if (subjects && !subjects.includes(post.subject)) throw new HttpError(404, 'Post not found');
}
