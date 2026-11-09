import { sql, upsertItem } from './db';
import { encryptSecret, decryptSecret } from './secrets';

const ROOT_FOLDER_ID = () => process.env.DRIVE_ROOT_FOLDER_ID!;

// ── Where the Google refresh token lives ─────────────────────
// 1. The database (saved by "Connect Google Drive" in super admin, encrypted)
// 2. The GOOGLE_REFRESH_TOKEN setting in Azure (older way, still works as a fallback)
const TOKEN_DOC_ID = 'google-drive-token';

export interface StoredDriveToken { refresh_token_enc: string; account_email?: string; connected_at: string }

async function loadStoredToken(): Promise<StoredDriveToken | null> {
  const rows = await sql<{ data: StoredDriveToken }[]>`SELECT data FROM items WHERE id = ${TOKEN_DOC_ID} AND type = 'setting'`;
  return rows[0]?.data ?? null;
}

export async function saveDriveToken(refreshToken: string, accountEmail?: string): Promise<void> {
  await upsertItem({
    id: TOKEN_DOC_ID, school_id: 'system', type: 'setting',
    refresh_token_enc: encryptSecret(refreshToken), account_email: accountEmail, connected_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
  _accessToken = null; _tokenExpiry = 0;
}

export async function clearDriveToken(): Promise<void> {
  await sql`DELETE FROM items WHERE id = ${TOKEN_DOC_ID} AND type = 'setting'`;
  _accessToken = null; _tokenExpiry = 0;
}

export async function getRefreshToken(): Promise<{ token: string; source: 'database' | 'azure'; email?: string; connectedAt?: string } | null> {
  const stored = await loadStoredToken();
  if (stored) {
    try { return { token: decryptSecret(stored.refresh_token_enc), source: 'database', email: stored.account_email, connectedAt: stored.connected_at }; }
    catch { /* unreadable (secret changed): fall through to the Azure setting */ }
  }
  return process.env.GOOGLE_REFRESH_TOKEN ? { token: process.env.GOOGLE_REFRESH_TOKEN, source: 'azure' } : null;
}

export const googleClientConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** True when uploads can work: the Google app settings exist and a refresh token is saved somewhere. */
export async function driveConfigured(): Promise<{ ok: boolean; reason?: string }> {
  if (!process.env.DRIVE_ROOT_FOLDER_ID) return { ok: false, reason: 'DRIVE_ROOT_FOLDER_ID is not set in Azure.' };
  if (!googleClientConfigured()) return { ok: false, reason: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set in Azure.' };
  if (!(await getRefreshToken())) return { ok: false, reason: 'Google Drive is not connected. A super admin must open Super Admin → Google Drive → Connect Google Drive.' };
  return { ok: true };
}

let _accessToken: string | null = null;
let _tokenExpiry = 0;

export async function getAccessToken(): Promise<string> {
  if (_accessToken && Date.now() < _tokenExpiry - 60_000) return _accessToken;

  const refresh = await getRefreshToken();
  if (!googleClientConfigured() || !refresh) {
    throw new Error('Google Drive is not connected. A super admin must open Super Admin → Google Drive → Connect Google Drive.');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refresh.token,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json() as { access_token: string; expires_in: number; error?: string; error_description?: string };
  if (data.error || !data.access_token) {
    const why = data.error === 'invalid_grant'
      ? 'Google rejected the saved sign-in (expired or revoked). A super admin must open Super Admin → Google Drive → Reconnect.'
      : `${data.error ?? 'no access token returned'}${data.error_description ? ' — ' + data.error_description : ''}`;
    throw new Error(`Google Drive sign-in failed: ${why}`);
  }
  _accessToken = data.access_token;
  _tokenExpiry  = Date.now() + data.expires_in * 1000;
  return _accessToken;
}

/** Live check used by the super admin card: can we sign in and see the attachments folder? */
export async function driveHealth(): Promise<{ ok: boolean; folder?: string; error?: string }> {
  try {
    const token = await getAccessToken();
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ROOT_FOLDER_ID())}?fields=id,name`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return { ok: false, error: r.status === 404 ? 'Signed in, but the attachments folder (DRIVE_ROOT_FOLDER_ID) was not found. Connect with the Google account that owns it.' : `Google Drive answered ${r.status}.` };
    const f = await r.json() as { name: string };
    return { ok: true, folder: f.name };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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

export async function findOrCreateFolder(name: string, parentId: string): Promise<string> {
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
  const schoolFolder  = await findOrCreateFolder(schoolSlug, ROOT_FOLDER_ID());
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

/** Upload a small file (<5 MB) in a single multipart request and return its Drive file ID. */
export async function uploadSmallFile(
  buffer: Buffer, mimeType: string, filename: string, folderId: string
): Promise<string> {
  const token    = await getAccessToken();
  const boundary = '----SchoolHubBoundary';
  const meta     = JSON.stringify({ name: filename, parents: [folderId] });
  const body     = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status} — ${await res.text()}`);
  const data = await res.json() as { id: string };
  return data.id;
}

export async function serveFile(driveId: string): Promise<{ stream: ReadableStream; mimeType: string; name: string }> {
  const token = await getAccessToken();
  const [meta, mediaRes] = await Promise.all([
    fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?fields=name,mimeType`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (r) => {
      if (!r.ok) throw new Error(`Drive meta error ${r.status}`);
      return r.json() as Promise<{ name: string; mimeType: string }>;
    }),
    fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);
  if (!mediaRes.ok) throw new Error(`Drive stream error ${mediaRes.status}: ${await mediaRes.text()}`);
  return { stream: mediaRes.body!, mimeType: meta.mimeType ?? 'application/octet-stream', name: meta.name };
}

