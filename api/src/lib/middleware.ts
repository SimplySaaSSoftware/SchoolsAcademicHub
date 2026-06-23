import { HttpRequest } from '@azure/functions';
import { verifyToken } from './auth';
import { JwtPayload, Role } from '../types';

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
  console.error(err);
  return { status: 500, jsonBody: { error: 'Internal server error' } };
}
