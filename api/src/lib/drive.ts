const ROOT_FOLDER_ID   = process.env.DRIVE_ROOT_FOLDER_ID!;
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN!;

let _accessToken: string | null = null;
let _tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (_accessToken && Date.now() < _tokenExpiry - 60_000) return _accessToken;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REFRESH_TOKEN env vars');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json() as { access_token: string; expires_in: number; error?: string };
  if (data.error) throw new Error(`OAuth token refresh failed: ${data.error}`);
  _accessToken = data.access_token;
  _tokenExpiry  = Date.now() + data.expires_in * 1000;
  return _accessToken;
}

async function driveRequest(url: string, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();
  const res   = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function findOrCreateFolder(name: string, parentId: string): Promise<string> {
  const token = await getAccessToken();
  const q     = encodeURIComponent(`name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res   = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data  = await res.json() as { files: { id: string }[] };
  if (data.files.length > 0) return data.files[0].id;

  const created = await driveRequest('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  return created.id;
}

export async function ensureFolderPath(schoolSlug: string, grade: number, subject: string): Promise<string> {
  const schoolFolder  = await findOrCreateFolder(schoolSlug, ROOT_FOLDER_ID);
  const gradeFolder   = await findOrCreateFolder(`Grade ${grade}`, schoolFolder);
  const subjectFolder = await findOrCreateFolder(subject, gradeFolder);
  return subjectFolder;
}

export async function createUploadSession(
  filename: string, mimeType: string, fileSize: number, folderId: string
): Promise<string> {
  const token = await getAccessToken();
  const meta  = JSON.stringify({ name: filename, parents: [folderId] });
  const res   = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(fileSize),
      },
      body: meta,
    }
  );
  if (!res.ok) throw new Error(`Could not create upload session: ${res.status}`);
  return res.headers.get('location')!;
}

export async function proxyChunk(
  uploadUrl: string, base64: string, mimeType: string, offset: number, totalSize: number
): Promise<{ done: boolean; driveId?: string }> {
  const bytes = Buffer.from(base64, 'base64');
  const end   = offset + bytes.length - 1;

  // Resumable upload session URLs are self-authenticating — no Authorization header needed
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Range': `bytes ${offset}-${end}/${totalSize}`,
      'Content-Type': mimeType,
    },
    body: bytes,
  });

  if (res.status === 308) return { done: false };
  if (res.status === 200 || res.status === 201) {
    const data = await res.json() as { id: string };
    return { done: true, driveId: data.id };
  }
  const body = await res.text().catch(() => '');
  throw new Error(`Chunk upload failed: ${res.status} — ${body}`);
}

export async function setPublicReadable(driveId: string): Promise<void> {
  await driveRequest(`https://www.googleapis.com/drive/v3/files/${driveId}/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
}

