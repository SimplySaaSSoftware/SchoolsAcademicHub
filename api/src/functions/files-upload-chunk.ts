import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { proxyChunk } from '../lib/drive';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);

    const { uploadUrl, base64, mimeType, offset, totalSize } = await req.json() as {
      uploadUrl: string; base64: string; mimeType: string; offset: number; totalSize: number;
    };
    if (!uploadUrl || !base64 || mimeType === undefined || offset === undefined || !totalSize) {
      throw new HttpError(400, 'uploadUrl, base64, mimeType, offset, totalSize required');
    }

    const result = await proxyChunk(uploadUrl, base64, mimeType, offset, totalSize);
    return { jsonBody: result };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('files-upload-chunk', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'files/upload-chunk',
  handler,
});
