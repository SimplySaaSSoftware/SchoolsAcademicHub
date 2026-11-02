import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as jwt from 'jsonwebtoken';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';
import { publicBase } from '../lib/site';
import { getRefreshToken, saveDriveToken, clearDriveToken, driveHealth, googleClientConfigured } from '../lib/drive';

const SECRET = () => (process.env.JWT_SECRET_SUPER || process.env.JWT_SECRET)!;
const SCOPES = 'https://www.googleapis.com/auth/drive openid email';

/** The address Google sends the user back to. Must be listed under "Authorised redirect URIs" in the Google client.
 *  `origin` is what the super admin's browser is on, so it is the real public address (see lib/site.ts). */
function redirectUri(req: HttpRequest, origin?: string | null): string {
  return `${publicBase(req, origin)}/api/google/callback`;
}

const back = (query: string): HttpResponseInit => ({ status: 302, headers: { Location: `/superadmin?${query}` } });

/** GET /google/status — is Drive connected, and does it really work right now? */
async function status(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    requireRole(requireAuth(req), ['super_admin']);
    const refresh = await getRefreshToken();
    const configured = googleClientConfigured() && !!process.env.DRIVE_ROOT_FOLDER_ID;
    const health = refresh && configured ? await driveHealth() : null;
    return {
      jsonBody: {
        client_configured: googleClientConfigured(),
        folder_configured: !!process.env.DRIVE_ROOT_FOLDER_ID,
        connected: !!refresh,
        source: refresh?.source ?? null,
        account_email: refresh?.email ?? null,
        connected_at: refresh?.connectedAt ?? null,
        healthy: health?.ok ?? false,
        folder: health?.folder ?? null,
        error: health && !health.ok ? health.error : null,
        redirect_uri: redirectUri(req, req.query.get('origin')),
      },
    };
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /google/connect-url — returns the Google sign-in address. `state` proves the callback belongs to this super admin. */
async function connectUrl(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = requireAuth(req);
    requireRole(user, ['super_admin']);
    if (!googleClientConfigured()) throw new HttpError(500, 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in Azure first.');
    const body = await req.json().catch(() => ({})) as { origin?: string };
    const ru = redirectUri(req, body.origin);
    // The redirect address is signed into `state`, so the callback uses exactly the one Google was given
    const state = jwt.sign({ purpose: 'google-drive-connect', uid: user.user_id, ru }, SECRET(), { expiresIn: '10m' });
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: ru,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',     // gives us a refresh token
      prompt: 'consent',          // always return one, even if the user connected before
      include_granted_scopes: 'true',
      state,
    });
    return { jsonBody: { url } };
  } catch (err) {
    return errorResponse(err);
  }
}

/** GET /google/callback — Google sends the browser here with ?code=…&state=… (no login header, so `state` is the proof). */
async function callback(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  const fail = (msg: string) => back(`drive=error&msg=${encodeURIComponent(msg)}`);
  try {
    const googleError = req.query.get('error');
    if (googleError) return fail(googleError === 'access_denied' ? 'Google sign-in was cancelled.' : `Google said: ${googleError}`);

    const code = req.query.get('code');
    const state = req.query.get('state');
    if (!code || !state) return fail('Missing code from Google. Please try again.');
    let ru = '';
    try {
      const s = jwt.verify(state, SECRET()) as { purpose?: string; ru?: string };
      if (s.purpose !== 'google-drive-connect' || !s.ru) throw new Error('wrong purpose');
      ru = s.ru;
    } catch {
      return fail('This sign-in link expired. Please click Connect Google Drive again.');
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, grant_type: 'authorization_code', redirect_uri: ru,
        client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      }),
    });
    const data = await res.json() as { refresh_token?: string; id_token?: string; error?: string; error_description?: string };
    if (data.error) {
      return fail(data.error === 'redirect_uri_mismatch'
        ? `Google rejected the redirect address. Add ${ru} under Authorised redirect URIs in your Google client.`
        : `Google said: ${data.error}${data.error_description ? ' — ' + data.error_description : ''}`);
    }
    if (!data.refresh_token) return fail('Google did not return a long-lived sign-in. Remove SchoolsAcademicHub at myaccount.google.com/permissions, then try again.');

    let email: string | undefined;
    try { email = JSON.parse(Buffer.from(data.id_token!.split('.')[1], 'base64url').toString()).email; } catch { /* email is only for display */ }

    await saveDriveToken(data.refresh_token, email);
    return back('drive=connected');
  } catch (err) {
    console.error('[google callback]', err);
    return fail('Something went wrong saving the connection. Please try again.');
  }
}

/** POST /google/disconnect — forget the saved sign-in (the Azure setting, if any, becomes the fallback). */
async function disconnect(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    requireRole(requireAuth(req), ['super_admin']);
    await clearDriveToken();
    return { jsonBody: { ok: true } };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('google-status',     { methods: ['GET'],  authLevel: 'anonymous', route: 'google/status',      handler: status });
app.http('google-connect',    { methods: ['POST'], authLevel: 'anonymous', route: 'google/connect-url', handler: connectUrl });
app.http('google-callback',   { methods: ['GET'],  authLevel: 'anonymous', route: 'google/callback',    handler: callback });
app.http('google-disconnect', { methods: ['POST'], authLevel: 'anonymous', route: 'google/disconnect',   handler: disconnect });
