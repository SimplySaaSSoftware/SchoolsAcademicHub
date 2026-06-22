/* superadmin.js — provision and manage schools */
(async () => {
  const main   = document.querySelector('main');
  const notify = document.getElementById('notification');
  document.getElementById('btn-logout').addEventListener('click', logout);

  function showNotify(msg, isError = false) {
    notify.textContent = msg;
    notify.className   = `notification${isError ? ' notification--error' : ''}`;
    notify.hidden      = false;
    setTimeout(() => { notify.hidden = true; }, 3500);
  }
  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Check session — show login form if not authenticated
  let session = getSession();
  if (!session || session.role !== 'super_admin') {
    showLoginForm();
    return;
  }

  await loadSchools();

  // ── Login form ────────────────────────────────────────────────
  function showLoginForm() {
    main.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
        <div class="login-card" style="max-width:380px;width:100%">
          <h1 class="login-card__title">Super Admin</h1>
          <div id="login-error" class="error-banner" hidden></div>
          <form id="login-form" novalidate>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input id="sa-email" class="form-control" type="email" autocomplete="email" required/>
            </div>
            <div class="form-group">
              <label class="form-label">Password</label>
              <input id="sa-password" class="form-control" type="password" autocomplete="current-password" required/>
            </div>
            <button type="submit" class="btn btn--primary" style="width:100%">Sign in</button>
          </form>
        </div>
      </div>`;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('login-error');
      errEl.hidden = true;
      const btn = e.target.querySelector('button');
      btn.disabled = true; btn.textContent = 'Signing in…';

      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            email:    document.getElementById('sa-email').value.trim(),
            password: document.getElementById('sa-password').value,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        if (data.role !== 'super_admin') throw new Error('Not a super admin account');
        saveSession(data);
        session = data;
        await loadSchools();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    });
  }

  // ── Schools list ──────────────────────────────────────────────
  let schools = [];

  async function loadSchools() {
    main.innerHTML = '<p class="loading-text">Loading schools…</p>';
    try {
      schools = await apiGet('/superadmin/schools');
    } catch (e) {
      main.innerHTML = `<p style="color:red;padding:1rem">${e.message}</p>`; return;
    }
    renderSchools();
  }

  function renderSchools() {
    let html = `
      <div class="page-toolbar" style="margin-bottom:1.5rem">
        <h1 class="page-title" style="margin:0">Schools</h1>
        <button id="btn-new-school" class="btn btn--primary">+ New School</button>
      </div>
      <table class="table">
        <thead><tr>
          <th>Name</th><th>Slug</th><th>Auth Mode</th><th>Student Auth</th><th>Active</th><th></th>
        </tr></thead>
        <tbody>`;

    if (!schools.length) {
      html += '<tr><td colspan="6" style="text-align:center;color:#888;padding:2rem">No schools yet.</td></tr>';
    }
    schools.forEach((s) => {
      html += `<tr>
        <td><strong>${esc(s.name)}</strong></td>
        <td><code>/${esc(s.slug)}</code></td>
        <td>${esc(s.auth_mode)}</td>
        <td>${esc(s.student_auth)}</td>
        <td>${s.active ? '<span class="badge badge--published">Active</span>' : '<span class="badge badge--draft">Inactive</span>'}</td>
        <td class="table-actions">
          <button class="btn btn--secondary btn--sm" data-action="edit" data-id="${esc(s.id)}">Edit</button>
          <a class="btn btn--ghost btn--sm" href="/${esc(s.slug)}" target="_blank" rel="noopener" style="color:var(--primary);border-color:var(--primary)">Login &nearr;</a>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    main.innerHTML = html;

    document.getElementById('btn-new-school').addEventListener('click', () => showSchoolModal(null));
    main.querySelectorAll('[data-action="edit"]').forEach((b) => {
      b.addEventListener('click', () => showSchoolModal(schools.find((s) => s.id === b.dataset.id)));
    });
  }

  // ── School modal ──────────────────────────────────────────────
  function showSchoolModal(school) {
    const isEdit = !!school;
    const gradeDefaults = (school?.grades ?? [1,2,3,4,5,6,7]).join(',');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal--wide">
        <div class="modal__header">
          <h2>${isEdit ? `Edit — ${esc(school.name)}` : 'New School'}</h2>
          <button class="btn btn--ghost btn--sm modal-close" style="margin-left:auto;color:#333">&times;</button>
        </div>
        <div class="modal__body">
          <div class="form-group">
            <label class="form-label">School Name *</label>
            <input id="s-name" class="form-control" value="${esc(school?.name ?? '')}" placeholder="Humansdorp Primary School"/>
          </div>
          <div class="form-group">
            <label class="form-label">URL Slug * <span style="color:#888;font-size:.8rem">(lowercase, hyphens only)</span></label>
            <input id="s-slug" class="form-control" value="${esc(school?.slug ?? '')}" placeholder="humansdorp-primary" ${isEdit ? 'readonly style="background:#f5f5f5"' : ''}/>
          </div>
          <div class="form-group">
            <label class="form-label">Logo URL</label>
            <input id="s-logo" class="form-control" type="url" value="${esc(school?.logo_url ?? '')}" placeholder="https://…/logo.png"/>
          </div>
          <div class="form-group">
            <label class="form-label">Primary Colour</label>
            <div style="display:flex;gap:.5rem;align-items:center">
              <input id="s-colour-picker" type="color" value="${esc(school?.primary_colour ?? '#1a56a0')}" style="height:36px;width:48px;padding:2px;border:1px solid #ccc;border-radius:4px;cursor:pointer"/>
              <input id="s-colour" class="form-control" style="max-width:120px" value="${esc(school?.primary_colour ?? '#1a56a0')}"/>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Staff Auth Mode</label>
            <select id="s-auth-mode" class="form-control">
              <option value="pin"   ${school?.auth_mode === 'pin'   ? 'selected' : ''}>PIN (shared staff PIN)</option>
              <option value="email" ${school?.auth_mode === 'email' ? 'selected' : ''}>Email + Password</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Student Auth Mode</label>
            <select id="s-student-auth" class="form-control">
              <option value="grade_pin"     ${school?.student_auth === 'grade_pin'     ? 'selected' : ''}>Grade PIN (one PIN per grade)</option>
              <option value="student_pin"   ${school?.student_auth === 'student_pin'   ? 'selected' : ''}>Student PIN (individual PINs)</option>
              <option value="student_email" ${school?.student_auth === 'student_email' ? 'selected' : ''}>Student Email + Password</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Grades (comma-separated) *</label>
            <input id="s-grades" class="form-control" value="${esc(gradeDefaults)}" placeholder="1,2,3,4,5,6,7"/>
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:.75rem">
            <input id="s-active" type="checkbox" ${(school?.active ?? true) ? 'checked' : ''}/>
            <label class="form-label" style="margin:0">Active</label>
          </div>
          <button id="btn-save-school" class="btn btn--primary" style="width:100%;margin-top:.5rem">${isEdit ? 'Update School' : 'Create School'}</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const picker = overlay.querySelector('#s-colour-picker');
    const text   = overlay.querySelector('#s-colour');
    picker.addEventListener('input', () => { text.value = picker.value; });
    text.addEventListener('input',   () => { if (/^#[0-9a-f]{6}$/i.test(text.value)) picker.value = text.value; });

    overlay.querySelector('#btn-save-school').addEventListener('click', async () => {
      const gradesRaw = overlay.querySelector('#s-grades').value.split(',').map((g) => Number(g.trim())).filter((g) => g > 0);
      const body = {
        name:           overlay.querySelector('#s-name').value.trim(),
        slug:           overlay.querySelector('#s-slug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        logo_url:       overlay.querySelector('#s-logo').value.trim() || '',
        primary_colour: overlay.querySelector('#s-colour').value.trim() || '#1a56a0',
        auth_mode:      overlay.querySelector('#s-auth-mode').value,
        student_auth:   overlay.querySelector('#s-student-auth').value,
        grades:         gradesRaw,
        active:         overlay.querySelector('#s-active').checked,
      };
      if (!body.name || !body.slug) { showNotify('Name and slug are required.', true); return; }
      if (!gradesRaw.length)        { showNotify('At least one grade required.', true); return; }

      const btn = overlay.querySelector('#btn-save-school');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        if (isEdit) await apiPut(`/superadmin/schools/${school.id}`, body);
        else        await apiPost('/superadmin/schools', body);
        overlay.remove();
        showNotify(isEdit ? 'School updated.' : 'School created.');
        await loadSchools();
      } catch (e) {
        showNotify(e.message, true);
        btn.disabled = false; btn.textContent = isEdit ? 'Update School' : 'Create School';
      }
    });
  }
})();
