import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { setPublicReadable } from '../lib/drive';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);

    const { driveId } = await req.json() as { driveId: string };
    if (!driveId) throw new HttpError(400, 'driveId required');

    await setPublicReadable(driveId);
    return { jsonBody: { ok: true } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('files-finalize', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'files/finalize',
  handler,
});
