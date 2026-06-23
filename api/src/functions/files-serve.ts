import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { requireAuth, errorResponse, HttpError } from '../lib/middleware';
import { verifyToken } from '../lib/auth';
import { serveFile } from '../lib/drive';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    // Accept token via header (API calls) or ?t= query param (iframe src)
    const qToken = req.query.get('t');
    if (qToken) {
      try { verifyToken(qToken); } catch { throw new HttpError(401, 'Invalid or expired token'); }
    } else {
      requireAuth(req);
    }

    const driveId = req.params.driveId;
    if (!driveId) return { status: 400, jsonBody: { error: 'driveId required' } };

    const { stream, mimeType, name } = await serveFile(driveId);

    const safeName = encodeURIComponent(name).replace(/'/g, '%27');
    return {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename*=UTF-8''${safeName}`,
        'Cache-Control': 'private, max-age=3600',
      },
      body: stream,
    };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('files-serve', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'files/{driveId}',
  handler,
});
