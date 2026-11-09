import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { driveConfigured, findOrCreateFolder, uploadSmallFile, setPublicReadable } from '../lib/drive';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['super_admin']);

    const { filename, mimeType, data } = await req.json() as {
      filename: string; mimeType: string; data: string;
    };
    if (!filename || !mimeType || !data) throw new HttpError(400, 'filename, mimeType and data required');
    if (!ALLOWED_TYPES.includes(mimeType))  throw new HttpError(400, 'Only PNG, JPEG, GIF, WebP and SVG logos are supported');

    const buffer = Buffer.from(data, 'base64');
    if (buffer.length > MAX_BYTES) throw new HttpError(400, 'Logo must be under 5 MB');

    const drive = await driveConfigured();
    if (!drive.ok) throw new HttpError(500, drive.reason!);

    const logosFolderId = await findOrCreateFolder('logos', process.env.DRIVE_ROOT_FOLDER_ID!);
    const driveId       = await uploadSmallFile(buffer, mimeType, filename, logosFolderId);
    await setPublicReadable(driveId);

    // lh3.googleusercontent.com serves public Drive images reliably via CDN
    const url = `https://lh3.googleusercontent.com/d/${driveId}`;
    return { jsonBody: { url } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('school-logo-upload', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'school-logo',
  handler,
});
