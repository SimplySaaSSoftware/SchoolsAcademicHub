import { HttpRequest } from '@azure/functions';

/** Accept only a plain web origin (scheme + host). Anything else is ignored. */
export function cleanOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
    return u.origin;
  } catch { return null; }
}

/**
 * The public address of the site (what the browser shows), e.g. https://polite-island-….azurestaticapps.net
 *
 * Behind Azure Static Web Apps the Functions code is reached through a hidden internal host
 * (…azurewebsites.net), so the Host header is NOT the public address. Order of trust:
 *   1. SITE_URL setting (explicit)
 *   2. `hint`: the origin the page itself reports (window.location.origin)
 *   3. x-ms-original-url / Origin / Referer headers the browser or Azure forwarded
 *   4. forwarded / plain Host header (last resort)
 */
export function publicBase(req: HttpRequest, hint?: string | null): string {
  const candidates = [
    process.env.SITE_URL,
    hint,
    req.headers.get('x-ms-original-url'),
    req.headers.get('origin'),
    req.headers.get('referer'),
  ];
  for (const c of candidates) {
    const o = cleanOrigin(c);
    if (o) return o;
  }
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost';
  return `https://${host}`;
}
