import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { ensureSchema } from '../lib/db';
import { requireAuth, requireRole, errorResponse } from '../lib/middleware';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['super_admin']);
    await ensureSchema();
    return { jsonBody: { ok: true, message: 'Schema initialised.' } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('init-schema', { methods: ['POST'], authLevel: 'anonymous', route: 'admin/init-schema', handler });
