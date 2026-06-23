/* admin.js — school admin portal: users, pins, subjects, terms, posts overview, exports */
(async () => {
  const session = requireSession(['admin', 'super_admin']);
  if (!session) return;

  const main   = document.querySelector('main');
  const notify = document.getElementById('notification');

  let school = {};
  try {
    school = await apiGet(`/school/config/${SCHOOL_SLUG}`);
    document.title = `${school.name} — Admin`;
    document.documentElement.style.setProperty('--primary', school.primary_colour ?? '#1a56a0');
    document.getElementById('school-brand').textContent = `${school.name} — Admin`;
  } catch {}

  document.getElementById('btn-logout').addEventListener('click', logout);

  function showNotify(msg, isError = false) {
    notify.textContent = msg;
    notify.className   = `notification${isError ? ' notification--error' : ''}`;
    notify.hidden      = false;
    setTimeout(() => { notify.hidden = true; }, 3500);
  }
  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── Tabs ─────────────────────────────────────────────────────
  const TABS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'posts',     label: 'Posts' },
    { id: 'users',     label: 'Users' },
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
    let posts;
    try { posts = await apiGet(`/posts?school_id=${SCHOOL_SLUG}`); }
    catch (e) { tabEl().innerHTML = `<p style="color:red">${e.message}</p>`; return; }

    let html = `
      <div style="margin-bottom:1rem;text-align:right">
        <button id="btn-export-posts-tab" class="btn btn--secondary btn--sm">Export Excel</button>
      </div>
      <table class="table">
        <thead><tr><th>Title</th><th>Grade</th><th>Subject</th><th>Term</th><th>Status</th><th>Author</th></tr></thead>
        <tbody>`;
    if (!posts.length) html += '<tr><td colspan="6" style="text-align:center;color:#888;padding:1.5rem">No posts.</td></tr>';
    posts.forEach((p) => {
      html += `<tr>
        <td>${esc(p.title)}</td><td>${esc(String(p.grade))}</td>
        <td>${esc(p.subject)}</td><td>${esc(p.term)}</td>
        <td><span class="badge badge--${p.status === 'published' ? 'published' : 'draft'}">${esc(p.status)}</span></td>
        <td>${esc(p.author_name ?? '')}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    tabEl().innerHTML = html;
    document.getElementById('btn-export-posts-tab').addEventListener('click', () =>
      downloadExport('/admin/export/posts', 'all-posts.xlsx').catch((e) => showNotify(e.message, true)));
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
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Grade</th><th>Active</th><th></th></tr></thead>
        <tbody>`;
    if (!users.length) html += '<tr><td colspan="6" style="text-align:center;color:#888;padding:1.5rem">No users.</td></tr>';
    users.forEach((u) => {
      html += `<tr>
        <td>${esc(u.name)}</td><td>${esc(u.email ?? '')}</td>
        <td>${esc(u.role)}</td><td>${u.grade ?? '—'}</td>
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

  function showUserModal(user, allUsers) {
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
      <div class="form-group"><label class="form-label">${isEdit ? 'New Password (leave blank to keep)' : 'Password *'}</label>
        <input id="u-password" class="form-control" type="password" autocomplete="new-password"/></div>
      <button id="btn-save-user" class="btn btn--primary" style="width:100%">${isEdit ? 'Update' : 'Create'}</button>`);

    modal.querySelector('#btn-save-user').addEventListener('click', async () => {
      const body = {
        name:     modal.querySelector('#u-name').value.trim(),
        email:    modal.querySelector('#u-email').value.trim(),
        role:     modal.querySelector('#u-role').value,
        grade:    modal.querySelector('#u-grade').value ? Number(modal.querySelector('#u-grade').value) : undefined,
        password: modal.querySelector('#u-password').value || undefined,
      };
      try {
        if (isEdit) await apiPut(`/users/${user.id}`, body);
        else        await apiPost('/users', body);
        modal.remove(); showNotify(isEdit ? 'User updated.' : 'User created.'); renderUsers();
      } catch (e) { showNotify(e.message, true); }
    });
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
        <thead><tr><th>Label</th><th>Role</th><th>Grade</th><th></th></tr></thead>
        <tbody>`;
    if (!pins.length) html += '<tr><td colspan="4" style="text-align:center;color:#888;padding:1.5rem">No PINs configured.</td></tr>';
    pins.forEach((p) => {
      html += `<tr>
        <td>${esc(p.label)}</td><td>${esc(p.role)}</td><td>${p.grade ?? '—'}</td>
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

  function showPinModal() {
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
      <div class="form-group"><label class="form-label">PIN (4–8 digits) *</label>
        <input id="p-pin" class="form-control pin-input" type="password" inputmode="numeric" maxlength="8" autocomplete="off" data-lpignore="true"/></div>
      <button id="btn-save-pin" class="btn btn--primary" style="width:100%">Create PIN</button>`);

    modal.querySelector('#btn-save-pin').addEventListener('click', async () => {
      const body = {
        label: modal.querySelector('#p-label').value.trim(),
        role:  modal.querySelector('#p-role').value,
        grade: modal.querySelector('#p-grade').value ? Number(modal.querySelector('#p-grade').value) : undefined,
        pin:   modal.querySelector('#p-pin').value.trim(),
      };
      try { await apiPost('/pins', body); modal.remove(); showNotify('PIN created.'); renderPins(); }
      catch (e) { showNotify(e.message, true); }
    });
  }

  // ── Subjects ─────────────────────────────────────────────────
  async function renderSubjects() {
    let subjects;
    try { subjects = await apiGet(`/subjects?school_id=${SCHOOL_SLUG}`); }
    catch (e) { tabEl().innerHTML = `<p style="color:red">${e.message}</p>`; return; }

    tabEl().innerHTML = `
      <h2 style="margin-bottom:1rem">Subjects</h2>
      <div style="display:flex;gap:.5rem;margin-bottom:1rem">
        <input id="new-subject" class="form-control" style="max-width:280px" placeholder="e.g. Mathematics"/>
        <button id="btn-add-subject" class="btn btn--primary">Add</button>
      </div>
      <ul class="tag-list" id="subject-list">
        ${subjects.map((s) => `<li class="tag">${esc(s)} <button class="tag__del" data-name="${esc(s)}">&times;</button></li>`).join('')}
      </ul>`;

    document.getElementById('btn-add-subject').addEventListener('click', async () => {
      const name = document.getElementById('new-subject').value.trim();
      if (!name) return;
      try { await apiPost('/subjects', { name }); showNotify('Subject added.'); renderSubjects(); }
      catch (e) { showNotify(e.message, true); }
    });
    // Delete by name — look up id from full list (need id from server; refactor: store id in tag)
    // For now subjects returns names, so we need a separate approach — skip delete for simplicity
    // (subjects are soft-managed; teachers just stop using them)
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
