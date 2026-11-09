async function apiFetch(path, options = {}) {
  const token = getToken();
  const session = getSession();
  // When super_admin operates on a school admin page, scope API calls to that school
  const schoolHeader = (session?.role === 'super_admin' && SCHOOL_SLUG)
    ? { 'X-School-Id': SCHOOL_SLUG } : {};
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'X-Auth-Token': token } : {}),
    ...schoolHeader,
    ...(options.headers ?? {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    // On superadmin page, don't redirect or clear session — let caller handle it
    if (window.location.pathname.startsWith('/superadmin')) {
      throw new Error('Session expired — please log in again');
    }
    clearSession();
    window.location.href = SCHOOL_SLUG ? `/${SCHOOL_SLUG}` : '/';
    throw new Error('Session expired');
  }

  if (res.status === 204) return null;

  // Handle binary responses (Excel exports)
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('spreadsheetml') || contentType.includes('octet-stream')) {
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function apiGet(path)            { return apiFetch(path, { method: 'GET' }); }
function apiPost(path, body)     { return apiFetch(path, { method: 'POST',   body: JSON.stringify(body) }); }
function apiPut(path, body)      { return apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) }); }
function apiDelete(path)         { return apiFetch(path, { method: 'DELETE' }); }

async function downloadExport(path, filename) {
  const blob = await apiGet(path);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function _setPageIcon(url) {
  // Remove all existing icon links (there may be multiple — .ico and .svg fallback)
  document.querySelectorAll('link[rel="icon"]').forEach((l) => l.remove());
  const icon = document.createElement('link');
  icon.rel  = 'icon';
  icon.href = url;
  icon.type = url.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  document.head.appendChild(icon);

  let atl = document.querySelector('link[rel="apple-touch-icon"]');
  if (!atl) { atl = document.createElement('link'); atl.rel = 'apple-touch-icon'; document.head.appendChild(atl); }
  atl.href = url;
}

function setBrand(el, logoUrl, name) {
  if (logoUrl) {
    const img = document.createElement('img');
    img.src = logoUrl; img.alt = name; img.className = 'site-header__logo';
    img.onerror = function () { this.style.display = 'none'; };
    el.textContent = '';
    el.appendChild(img);
    el.appendChild(document.createTextNode(name));
    _setPageIcon(logoUrl);
  } else {
    el.textContent = name;
  }
}
