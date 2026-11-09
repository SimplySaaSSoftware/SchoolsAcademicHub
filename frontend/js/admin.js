/* admin.js — school admin portal: users, pins, subjects, terms, posts overview, exports */
(async () => {
  const session = requireSession(['admin', 'super_admin']);
  if (!session) return;

  const main   = document.querySelector('main');
  const notify = document.getElementById('notification');

  // Branding — apply cached color immediately to avoid flash on navigation
  const _brandKey = `brand_color_${SCHOOL_SLUG}`;
  const _cachedColor = sessionStorage.getItem(_brandKey);
  if (_cachedColor) document.documentElement.style.setProperty('--primary', _cachedColor);

  let school = {};
  try {
    school = await apiGet(`/school/config/${SCHOOL_SLUG}`);
    const _color = school.primary_colour ?? '#1a56a0';
    document.title = `${school.name} — Admin`;
    document.documentElement.style.setProperty('--primary', _color);
    setBrand(document.getElementById('school-brand'), school.logo_url, `${school.name} — Admin`);
    sessionStorage.setItem(_brandKey, _color);
  } catch {}

  document.getElementById('btn-logout').addEventListener('click', logout);

  let _notifyTimer;
  function showNotify(msg, isError = false) {
    notify.textContent = msg;
    notify.className   = `notification${isError ? ' notification--error' : ''}`;
    notify.hidden      = false;
    if (isError) console.error('[School Hub]', msg);   // also readable in the browser console
    clearTimeout(_notifyTimer);
    // Errors stay long enough to read and copy; tap one to close it
    _notifyTimer = setTimeout(() => { notify.hidden = true; }, isError ? 20000 : 3500);
  }
  notify.addEventListener('click', () => { notify.hidden = true; });
  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── Tabs ─────────────────────────────────────────────────────
  const TABS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'posts',     label: 'Posts' },
    { id: 'users',     label: 'Users' },
    { id: 'students',  label: 'Students' },
    { id: 'pins',      label: 'PINs' },
    { id: 'subjects',  label: 'Subjects' },
    { id: 'terms',     label: 'Terms' },
  ];

  let activeTab = 'dashboard';

  function renderShell() {
    main.innerHTML = `
      <nav class="tab-nav" id="tab-nav">
        ${TABS.map((t) => `<button class="tab-btn${t.id === activeTab ? ' tab-btn--active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
      </nav>
      <div id="tab-content" class="tab-content"></div>`;

    main.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        main.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('tab-btn--active', b.dataset.tab === activeTab));
        loadTab(activeTab);
      });
    });
    loadTab(activeTab);
  }

  function tabEl() { return document.getElementById('tab-content'); }

  async function loadTab(tab) {
    const el = tabEl();
    el.innerHTML = '<p class="loading-text">Loading…</p>';
    if (tab === 'dashboard') await renderDashboard();
    if (tab === 'posts')     await renderPosts();
    if (tab === 'users')     await renderUsers();
    if (tab === 'students')  await renderStudents();
    if (tab === 'pins')      await renderPins();
    if (tab === 'subjects')  await renderSubjects();
    if (tab === 'terms')     await renderTerms();
  }

  // ── Dashboard ────────────────────────────────────────────────
  async function renderDashboard() {
    let summary;
    try { summary = await apiGet('/dashboard/summary'); }
    catch (e) { tabEl().innerHTML = `<p style="color:red">${e.message}</p>`; return; }

    tabEl().innerHTML = `
      <div class="stats-summary" style="margin:1.5rem 0">
        <div class="stat-card"><span class="stat-card__value">${summary.published_posts ?? 0}</span><span class="stat-card__label">Published Posts</span></div>
        <div class="stat-card"><span class="stat-card__value">${summary.active_quizzes ?? 0}</span><span class="stat-card__label">Active Quizzes</span></div>
        ${summary.avg_quiz_score != null ? `<div class="stat-card"><span class="stat-card__value">${summary.avg_quiz_score}%</span><span class="stat-card__label">Avg Quiz Score</span></div>` : ''}
      </div>
      <div style="margin-top:1rem">
        <button id="btn-export-all-posts" class="btn btn--secondary">Export All Posts (Excel)</button>
      </div>`;

    document.getElementById('btn-export-all-posts').addEventListener('click', () =>
      downloadExport('/admin/export/posts', 'all-posts.xlsx').catch((e) => showNotify(e.message, true)));
  }

  // ── Posts overview ───────────────────────────────────────────
  async function renderPosts() {
    tabEl().innerHTML = `
      <div style="padding:2rem;text-align:center">
        <p style="margin-bottom:1rem;color:var(--text-light)">Post creation and editing is done in the Teacher portal.</p>
        <a class="btn btn--primary" href="/teacher/${SCHOOL_SLUG}">Go to Teacher Portal →</a>
      </div>`;
  }

  // ── Users ────────────────────────────────────────────────────
  async function renderUsers() {
    let users;
    try { users = await apiGet('/users'); }
    catch (e) { tabEl().innerHTML = `<p style="color:red">${e.message}</p>`; return; }

    let html = `
      <div class="page-toolbar" style="margin-bottom:1rem">
        <h2 style="margin:0">Users</h2>
        <button id="btn-add-user" class="btn btn--primary btn--sm">+ Add User</button>
      </div>
      <table class="table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Grade</th><th>Subjects</th><th>Active</th><th></th></tr></thead>
        <tbody>`;
    if (!users.length) html += '<tr><td colspan="7" style="text-align:center;color:#888;padding:1.5rem">No users.</td></tr>';
    users.forEach((u) => {
      html += `<tr>
        <td>${esc(u.name)}</td><td>${esc(u.email ?? '')}</td>
        <td>${esc(u.role)}</td><td>${u.grade ?? '—'}</td>
        <td>${u.role === 'teacher' ? (u.subjects?.length ? esc(u.subjects.join(', ')) : 'All in grade') : '—'}</td>
        <td>${u.active ? 'Yes' : 'No'}</td>
        <td class="table-actions">
          <button class="btn btn--secondary btn--sm" data-action="edit-user" data-id="${esc(u.id)}">Edit</button>
          ${u.active
            ? `<button class="btn btn--danger btn--sm" data-action="deact-user" data-id="${esc(u.id)}">Deactivate</button>`
            : `<button class="btn btn--danger btn--sm" data-action="del-user" data-id="${esc(u.id)}">Delete</button>`}
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    tabEl().innerHTML = html;

    document.getElementById('btn-add-user').addEventListener('click', () => showUserModal(null, users));
    tabEl().querySelectorAll('[data-action="edit-user"]').forEach((b) => {
      b.addEventListener('click', () => showUserModal(users.find((u) => u.id === b.dataset.id), users));
    });
    tabEl().querySelectorAll('[data-action="deact-user"]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Deactivate this user?')) return;
        try { await apiDelete(`/users/${b.dataset.id}`); showNotify('User deactivated.'); renderUsers(); }
        catch (e) { showNotify(e.message, true); }
      });
    });
    tabEl().querySelectorAll('[data-action="del-user"]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Permanently delete this user? This cannot be undone.')) return;
        try { await apiDelete(`/users/${b.dataset.id}?hard=true`); showNotify('User deleted.'); renderUsers(); }
        catch (e) { showNotify(e.message, true); }
      });
    });
  }

  // Subject checkboxes (teachers): none ticked = all subjects in their grade
  async function subjectPicker(selected = []) {
    const list = await apiGet(`/subjects?school_id=${SCHOOL_SLUG}`).catch(() => []);
    if (!list.length) return '<p style="color:#888;font-size:.9375rem">No subjects set up yet.</p>';
    return `<div class="subject-picker">${list.map((n) => `
      <label class="subject-picker__item">
        <input type="checkbox" value="${esc(n)}" ${selected.includes(n) ? 'checked' : ''}/> <span>${esc(n)}</span>
      </label>`).join('')}</div>
      <p style="color:#888;font-size:.875rem;margin-top:.35rem">Tick none to allow all subjects in the teacher's grade.</p>`;
  }
  const pickedSubjects = (modal) => [...modal.querySelectorAll('.subject-picker input:checked')].map((i) => i.value);

  async function showUserModal(user, allUsers) {
    const subjectHtml = await subjectPicker(user?.subjects ?? []);
    const isEdit = !!user;
    const gradeOpts = (school.grades ?? [1,2,3,4,5,6,7]).map((g) =>
      `<option value="${g}" ${user?.grade == g ? 'selected' : ''}>Grade ${g}</option>`).join('');
    const modal = createModal(`${isEdit ? 'Edit' : 'Add'} User`, `
      <div class="form-group"><label class="form-label">Name *</label>
        <input id="u-name" class="form-control" value="${esc(user?.name ?? '')}"/></div>
      <div class="form-group"><label class="form-label">Email *</label>
        <input id="u-email" class="form-control" type="email" value="${esc(user?.email ?? '')}"/></div>
      <div class="form-group"><label class="form-label">Role *</label>
        <select id="u-role" class="form-control">
          <option value="teacher" ${user?.role === 'teacher' ? 'selected' : ''}>Teacher</option>
          <option value="admin"   ${user?.role === 'admin'   ? 'selected' : ''}>Admin</option>
        </select></div>
      <div class="form-group"><label class="form-label">Grade (teachers)</label>
        <select id="u-grade" class="form-control"><option value="">—</option>${gradeOpts}</select></div>
      <div class="form-group" id="u-subjects-wrap"><label class="form-label">Subjects (teachers)</label>${subjectHtml}</div>
      <div class="form-group"><label class="form-label">${isEdit ? 'New Password (leave blank to keep)' : 'Password *'}</label>
        <input id="u-password" class="form-control" type="password" autocomplete="new-password"/></div>
      <button id="btn-save-user" class="btn btn--primary" style="width:100%">${isEdit ? 'Update' : 'Create'}</button>`);

    const syncSubjects = () => { modal.querySelector('#u-subjects-wrap').hidden = modal.querySelector('#u-role').value !== 'teacher'; };
    modal.querySelector('#u-role').addEventListener('change', syncSubjects); syncSubjects();
    modal.querySelector('#btn-save-user').addEventListener('click', async () => {
      const body = {
        name:     modal.querySelector('#u-name').value.trim(),
        email:    modal.querySelector('#u-email').value.trim(),
        role:     modal.querySelector('#u-role').value,
        grade:    modal.querySelector('#u-grade').value ? Number(modal.querySelector('#u-grade').value) : undefined,
        password: modal.querySelector('#u-password').value || undefined,
        subjects: modal.querySelector('#u-role').value === 'teacher' ? pickedSubjects(modal) : [],
      };
      try {
        if (isEdit) await apiPut(`/users/${user.id}`, body);
        else        await apiPost('/users', body);
        modal.remove(); showNotify(isEdit ? 'User updated.' : 'User created.'); renderUsers();
      } catch (e) { showNotify(e.message, true); }
    });
  }

  // ── Students (individual PINs): shared panel, see js/students.js ──
  function renderStudents() {
    return StudentsUI.mount(tabEl(), { school, role: 'admin', notify: showNotify });
  }

  // ── PINs ─────────────────────────────────────────────────────
  async function renderPins() {
    let pins;
    try { pins = await apiGet('/pins'); }
    catch (e) { tabEl().innerHTML = `<p style="color:red">${e.message}</p>`; return; }

    let html = `
      <div class="page-toolbar" style="margin-bottom:1rem">
        <h2 style="margin:0">PINs</h2>
        <button id="btn-add-pin" class="btn btn--primary btn--sm">+ Add PIN</button>
      </div>
      <table class="table">
        <thead><tr><th>Label</th><th>Role</th><th>Grade</th><th>Subjects</th><th></th></tr></thead>
        <tbody>`;
    if (!pins.length) html += '<tr><td colspan="5" style="text-align:center;color:#888;padding:1.5rem">No PINs configured.</td></tr>';
    pins.forEach((p) => {
      html += `<tr>
        <td>${esc(p.label)}</td><td>${esc(p.role)}</td><td>${p.grade ?? '—'}</td><td>${p.role === 'teacher' ? (p.subjects?.length ? esc(p.subjects.join(', ')) : 'All in grade') : '—'}</td>
        <td><button class="btn btn--danger btn--sm" data-action="del-pin" data-id="${esc(p.id)}">Delete</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    tabEl().innerHTML = html;

    document.getElementById('btn-add-pin').addEventListener('click', () => showPinModal());
    tabEl().querySelectorAll('[data-action="del-pin"]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Delete this PIN?')) return;
        try { await apiDelete(`/pins/${b.dataset.id}`); showNotify('PIN deleted.'); renderPins(); }
        catch (e) { showNotify(e.message, true); }
      });
    });
  }

  async function showPinModal() {
    const subjectHtml = await subjectPicker([]);
    const gradeOpts = (school.grades ?? [1,2,3,4,5,6,7]).map((g) =>
      `<option value="${g}">Grade ${g}</option>`).join('');
    const modal = createModal('Add PIN', `
      <div class="form-group"><label class="form-label">Label *</label>
        <input id="p-label" class="form-control" placeholder="e.g. Grade 4 Students"/></div>
      <div class="form-group"><label class="form-label">Role *</label>
        <select id="p-role" class="form-control">
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
        </select></div>
      <div class="form-group"><label class="form-label">Grade (students)</label>
        <select id="p-grade" class="form-control"><option value="">—</option>${gradeOpts}</select></div>
      <div class="form-group" id="p-subjects-wrap" hidden><label class="form-label">Subjects (teachers)</label>${subjectHtml}</div>
      <div class="form-group"><label class="form-label">PIN (4–8 digits) *</label>
        <input id="p-pin" class="form-control pin-input" type="password" inputmode="numeric" maxlength="8" autocomplete="off" data-lpignore="true"/></div>
      <button id="btn-save-pin" class="btn btn--primary" style="width:100%">Create PIN</button>`);

    const syncPinSubjects = () => { modal.querySelector('#p-subjects-wrap').hidden = modal.querySelector('#p-role').value !== 'teacher'; };
    modal.querySelector('#p-role').addEventListener('change', syncPinSubjects); syncPinSubjects();
    modal.querySelector('#btn-save-pin').addEventListener('click', async () => {
      const body = {
        label: modal.querySelector('#p-label').value.trim(),
        role:  modal.querySelector('#p-role').value,
        grade: modal.querySelector('#p-grade').value ? Number(modal.querySelector('#p-grade').value) : undefined,
        pin:   modal.querySelector('#p-pin').value.trim(),
        subjects: modal.querySelector('#p-role').value === 'teacher' ? pickedSubjects(modal) : [],
      };
      try { await apiPost('/pins', body); modal.remove(); showNotify('PIN created.'); renderPins(); }
      catch (e) { showNotify(e.message, true); }
    });
  }

  // ── Subjects (each has an English and an Afrikaans name) ─────
  async function renderSubjects() {
    let subjects;
    try { subjects = await apiGet(`/subjects?school_id=${SCHOOL_SLUG}&full=1`); }
    catch (e) { tabEl().innerHTML = `<p style="color:red">${esc(e.message)}</p>`; return; }

    tabEl().innerHTML = `
      <h2 style="margin-bottom:.5rem">Subjects</h2>
      <p style="color:#666;font-size:.9375rem;margin:0 0 1rem">Every subject needs both names. Students see the one for the language they chose.</p>
      <div class="subject-form">
        <div class="form-group"><label class="form-label" for="new-subject">English name</label>
          <input id="new-subject" class="form-control" placeholder="e.g. Mathematics" autocomplete="off"/></div>
        <div class="form-group"><label class="form-label" for="new-subject-af">Afrikaanse naam</label>
          <input id="new-subject-af" class="form-control" placeholder="bv. Wiskunde" autocomplete="off"/></div>
        <button id="btn-add-subject" class="btn btn--primary">Add subject</button>
      </div>
      <div class="student-list" id="subject-list">
        ${subjects.length ? subjects.map((s) => `
          <div class="student-row">
            <div class="student-row__info">
              <div class="student-row__name">${esc(s.names.en)} <span style="color:#888;font-weight:400">/</span> ${s.names.af ? esc(s.names.af) : '<span class="status-chip status-chip--retry">Afrikaans name missing</span>'}</div>
            </div>
            <div class="student-row__actions"><button class="btn btn--secondary btn--sm" data-edit-subject="${esc(s.id)}">${s.names.af ? 'Edit' : 'Add Afrikaans'}</button></div>
          </div>`).join('') : '<p class="dash-empty">No subjects yet.</p>'}
      </div>`;

    document.getElementById('btn-add-subject').addEventListener('click', async () => {
      const name = document.getElementById('new-subject').value.trim();
      const name_af = document.getElementById('new-subject-af').value.trim();
      if (!name || !name_af) { showNotify('Please fill in both the English and the Afrikaans name.', true); return; }
      try { await apiPost('/subjects', { name, name_af }); showNotify('Subject added.'); renderSubjects(); }
      catch (e) { showNotify(e.message, true); }
    });

    tabEl().querySelectorAll('[data-edit-subject]').forEach((b) => b.addEventListener('click', () => {
      const s = subjects.find((x) => x.id === b.dataset.editSubject);
      const modal = createModal('Edit subject names', `
        <div class="form-group"><label class="form-label">English name</label>
          <input id="e-subject-en" class="form-control" value="${esc(s.names.en)}"/></div>
        <div class="form-group"><label class="form-label">Afrikaanse naam</label>
          <input id="e-subject-af" class="form-control" value="${esc(s.names.af)}" placeholder="bv. Wiskunde"/></div>
        <p style="color:#888;font-size:.9375rem;margin:0 0 1rem">Existing posts keep working: they are linked to the original name "${esc(s.name)}".</p>
        <button id="btn-save-subject" class="btn btn--primary" style="width:100%">Save</button>`);
      modal.querySelector('#btn-save-subject').addEventListener('click', async () => {
        const name_en = modal.querySelector('#e-subject-en').value.trim();
        const name_af = modal.querySelector('#e-subject-af').value.trim();
        if (!name_en || !name_af) { showNotify('Both names are required.', true); return; }
        try { await apiPut(`/subjects/${s.id}`, { name_en, name_af }); modal.remove(); showNotify('Saved.'); renderSubjects(); }
        catch (e) { showNotify(e.message, true); }
      });
    }));
  }

  // ── Terms ────────────────────────────────────────────────────
  async function renderTerms() {
    let terms;
    try { terms = await apiGet(`/terms?school_id=${SCHOOL_SLUG}`); }
    catch (e) { tabEl().innerHTML = `<p style="color:red">${e.message}</p>`; return; }

    tabEl().innerHTML = `
      <h2 style="margin-bottom:1rem">Terms</h2>
      <div style="display:flex;gap:.5rem;margin-bottom:1rem">
        <input id="new-term" class="form-control" style="max-width:280px" placeholder="e.g. Term 1"/>
        <button id="btn-add-term" class="btn btn--primary">Add</button>
      </div>
      <ul class="tag-list" id="term-list">
        ${terms.map((t) => `<li class="tag">${esc(t)}</li>`).join('')}
      </ul>`;

    document.getElementById('btn-add-term').addEventListener('click', async () => {
      const name = document.getElementById('new-term').value.trim();
      if (!name) return;
      try { await apiPost('/terms', { name }); showNotify('Term added.'); renderTerms(); }
      catch (e) { showNotify(e.message, true); }
    });
  }

  // ── Modal helper ─────────────────────────────────────────────
  function createModal(title, bodyHtml) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal__header">
          <h2>${esc(title)}</h2>
          <button class="btn btn--ghost btn--sm modal-close" style="margin-left:auto">&times;</button>
        </div>
        <div class="modal__body">${bodyHtml}</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    return overlay;
  }

  renderShell();
})();
