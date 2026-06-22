const SESSION_KEY = 'hps_session';

function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function getToken() {
  return getSession()?.token ?? null;
}

function saveSession(data) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function logout() {
  clearSession();
  window.location.href = SCHOOL_SLUG ? `/${SCHOOL_SLUG}` : '/';
}

function requireSession(roles = []) {
  const s = getSession();
  if (!s || !s.token) {
    window.location.href = SCHOOL_SLUG ? `/${SCHOOL_SLUG}` : '/';
    return null;
  }
  if (roles.length > 0 && !roles.includes(s.role)) {
    window.location.href = SCHOOL_SLUG ? `/${SCHOOL_SLUG}` : '/';
    return null;
  }
  return s;
}

async function login(slug, credentials) {
  const res  = await fetch(`${API_BASE}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ slug, ...credentials }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  saveSession(data);
  return data;
}

async function requestPasswordReset(slug, email) {
  const res = await fetch(`${API_BASE}/auth/reset-request`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ slug, email }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Request failed'); }
}

async function confirmPasswordReset(slug, token, newPassword) {
  const res = await fetch(`${API_BASE}/auth/reset-confirm`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ slug, token, newPassword }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Reset failed'); }
}
