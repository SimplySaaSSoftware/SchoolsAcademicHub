import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { ensureFolderPath, createUploadSession } from '../lib/drive';
import { requireAuth, requireRole, errorResponse, effectiveSchoolId, HttpError } from '../lib/middleware';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt  = requireAuth(req);
    requireRole(jwt, ['teacher', 'admin', 'super_admin']);
    const schoolId = effectiveSchoolId(req, jwt);

    const { filename, mimeType, fileSize, grade, subject } = await req.json() as {
      filename: string; mimeType: string; fileSize: number; grade: number; subject: string;
    };
    if (!process.env.DRIVE_ROOT_FOLDER_ID) throw new HttpError(500, 'DRIVE_ROOT_FOLDER_ID env var not set');
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new HttpError(500, 'GOOGLE_SERVICE_ACCOUNT_JSON env var not set');

    if (!filename || !mimeType || !fileSize || !grade || !subject) {
      throw new HttpError(400, 'filename, mimeType, fileSize, grade, subject required');
    }

    const folderId  = await ensureFolderPath(schoolId, Number(grade), subject);
    const uploadUrl = await createUploadSession(filename, mimeType, fileSize, folderId);

    return { jsonBody: { uploadUrl } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('files-upload-session', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'files/upload-session',
  handler,
});
