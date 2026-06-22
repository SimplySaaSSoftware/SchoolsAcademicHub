async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    // On superadmin page, don't redirect — let the caller show the login form
    if (window.location.pathname.startsWith('/superadmin')) {
      throw new Error('Session expired — please log in again');
    }
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
