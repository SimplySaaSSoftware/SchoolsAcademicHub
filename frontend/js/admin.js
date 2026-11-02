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
    document.getElementById('school-brand').textContent = `${school.name} — Admin`;
    sessionStorage.setItem(_brandKey, _color);
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

  // ── Students (individual PINs) ───────────────────────────────
  let studentFilter = { grade: '', q: '' };

  async function renderStudents() {
    let students;
    try { students = await apiGet('/students'); }
    catch (e) { tabEl().innerHTML = `<p style="color:red">${esc(e.message)}</p>`; return; }

    const grades = school.grades ?? [1,2,3,4,5,6,7];
    const shown = students.filter((s) =>
      (!studentFilter.grade || String(s.grade) === studentFilter.grade) &&
      (!studentFilter.q || s.name.toLowerCase().includes(studentFilter.q.toLowerCase())));

    let html = `
      <div class="page-toolbar" style="margin-bottom:1rem">
        <h2 style="margin:0">Students <span style="font-weight:400;color:#888;font-size:.9375rem">(${shown.length}${shown.length !== students.length ? ` of ${students.length}` : ''})</span></h2>
        <div class="toolbar-actions">
          <button id="btn-import-students" class="btn btn--secondary">Import list</button>
          <button id="btn-add-student" class="btn btn--primary">+ Add Student</button>
        </div>
      </div>
      <div class="student-filters">
        <select id="st-grade" class="form-control" aria-label="Grade">
          <option value="">All grades</option>
          ${grades.map((g) => `<option value="${g}" ${String(g) === studentFilter.grade ? 'selected' : ''}>Grade ${g}</option>`).join('')}
        </select>
        <input id="st-search" class="form-control" type="search" placeholder="Search name…" value="${esc(studentFilter.q)}"/>
      </div>
      <p style="color:#888;font-size:.9375rem;margin:.5rem 0 1rem">PINs are shown once, when created or reset. They are not stored, so use <strong>Reset PIN</strong> if one is lost.</p>
      <div class="table-scroll-wrap"><table class="table">
        <thead><tr><th>Name</th><th>Grade</th><th>Active</th><th></th></tr></thead><tbody>`;
    if (!shown.length) html += `<tr><td colspan="4" style="text-align:center;color:#888;padding:1.5rem">${students.length ? 'No students match.' : 'No students yet. Add one or import a list.'}</td></tr>`;
    shown.forEach((s) => {
      html += `<tr>
        <td>${esc(s.name)}</td><td>${esc(String(s.grade))}</td><td>${s.active ? 'Yes' : 'No'}</td>
        <td class="table-actions">
          <button class="btn btn--secondary btn--sm" data-st="reset" data-id="${esc(s.id)}">Reset PIN</button>
          <button class="btn btn--secondary btn--sm" data-st="edit" data-id="${esc(s.id)}">Edit</button>
          ${s.active
            ? `<button class="btn btn--danger btn--sm" data-st="deact" data-id="${esc(s.id)}">Deactivate</button>`
            : `<button class="btn btn--danger btn--sm" data-st="del" data-id="${esc(s.id)}">Delete</button>`}
        </td></tr>`;
    });
    html += '</tbody></table></div>';
    tabEl().innerHTML = html;

    document.getElementById('st-grade').addEventListener('change', (e) => { studentFilter.grade = e.target.value; renderStudents(); });
    let t; document.getElementById('st-search').addEventListener('input', (e) => {
      studentFilter.q = e.target.value; clearTimeout(t);
      t = setTimeout(async () => { await renderStudents(); const el = document.getElementById('st-search'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250);
    });
    document.getElementById('btn-add-student').addEventListener('click', () => showStudentModal(null));
    document.getElementById('btn-import-students').addEventListener('click', showImportModal);
    tabEl().querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', async () => {
      const s = students.find((x) => x.id === b.dataset.id);
      try {
        if (b.dataset.st === 'edit') showStudentModal(s);
        if (b.dataset.st === 'reset') {
          if (!confirm(`Reset PIN for ${s.name}? The old PIN stops working.`)) return;
          const r = await apiPost(`/students/${s.id}/reset-pin`, {});
          showPinSheet('New PIN', [{ name: s.name, grade: s.grade, pin: r.pin }]);
        }
        if (b.dataset.st === 'deact') { if (!confirm(`Deactivate ${s.name}? They can no longer log in.`)) return; await apiDelete(`/students/${s.id}`); showNotify('Student deactivated.'); renderStudents(); }
        if (b.dataset.st === 'del')   { if (!confirm(`Permanently delete ${s.name}? Their quiz history stays.`)) return; await apiDelete(`/students/${s.id}?hard=true`); showNotify('Student deleted.'); renderStudents(); }
      } catch (e) { showNotify(e.message, true); }
    }));
  }

  function showStudentModal(student) {
    const isEdit = !!student;
    const gradeOpts = (school.grades ?? [1,2,3,4,5,6,7]).map((g) =>
      `<option value="${g}" ${student?.grade == g ? 'selected' : ''}>Grade ${g}</option>`).join('');
    const modal = createModal(`${isEdit ? 'Edit' : 'Add'} Student`, `
      <div class="form-group"><label class="form-label">Full name *</label>
        <input id="s-name" class="form-control" value="${esc(student?.name ?? '')}" autocomplete="off"/></div>
      <div class="form-group"><label class="form-label">Grade *</label>
        <select id="s-grade" class="form-control">${gradeOpts}</select></div>
      <button id="btn-save-student" class="btn btn--primary" style="width:100%">${isEdit ? 'Update' : 'Create &amp; show PIN'}</button>`);
    modal.querySelector('#btn-save-student').addEventListener('click', async () => {
      const body = { name: modal.querySelector('#s-name').value.trim(), grade: Number(modal.querySelector('#s-grade').value) };
      if (!body.name) { showNotify('Name is required.', true); return; }
      try {
        if (isEdit) { await apiPut(`/students/${student.id}`, body); modal.remove(); showNotify('Student updated.'); renderStudents(); }
        else { const r = await apiPost('/students', body); modal.remove(); renderStudents(); showPinSheet('Student created', [r]); }
      } catch (e) { showNotify(e.message, true); }
    });
  }

  function showImportModal() {
    const grades = school.grades ?? [1,2,3,4,5,6,7];
    const modal = createModal('Import students', `
      <p style="font-size:.9375rem;color:#555;margin:0 0 .75rem">One student per line. Add a grade after a comma to override the default, e.g. <code>Thandi Nkosi, 5</code>. Copy a column from Excel and paste it here.</p>
      <div class="form-group"><label class="form-label">Default grade</label>
        <select id="i-grade" class="form-control">${grades.map((g) => `<option value="${g}">Grade ${g}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Names</label>
        <textarea id="i-text" class="form-control" rows="10" placeholder="Thandi Nkosi&#10;Pieter van der Merwe, 6"></textarea></div>
      <button id="btn-do-import" class="btn btn--primary" style="width:100%">Import &amp; generate PINs</button>`);
    modal.querySelector('#btn-do-import').addEventListener('click', async () => {
      const def = Number(modal.querySelector('#i-grade').value);
      const lines = modal.querySelector('#i-text').value.split('\n').map((l) => l.trim()).filter(Boolean);
      const students = lines.map((l) => {
        const m = l.match(/^(.*?)[,;\t]\s*(\d{1,2})\s*$/);
        return m ? { name: m[1].trim(), grade: Number(m[2]) } : { name: l, grade: def };
      });
      if (!students.length) { showNotify('Paste at least one name.', true); return; }
      const btn = modal.querySelector('#btn-do-import'); btn.disabled = true; btn.textContent = `Importing ${students.length}…`;
      try {
        const created = await apiPost('/students/import', { students });
        modal.remove(); renderStudents(); showPinSheet(`${created.length} students created`, created);
      } catch (e) { showNotify(e.message, true); btn.disabled = false; btn.textContent = 'Import & generate PINs'; }
    });
  }

  // PINs are only known at this moment: show them with copy / CSV / print
  function showPinSheet(title, rows) {
    const modal = createModal(title, `
      <p style="font-size:.9375rem;color:#a33;margin:0 0 .75rem"><strong>Save these PINs now.</strong> They cannot be shown again.</p>
      <div class="pin-list">
        ${rows.map((r) => `<div class="pin-row"><div><div class="pin-row__name">${esc(r.name)}</div><div class="pin-row__grade">Grade ${esc(String(r.grade))}</div></div><strong class="pin-big">${esc(r.pin)}</strong></div>`).join('')}
      </div>
      <div class="tr-actions" style="position:static">
        <button class="btn btn--secondary" id="pin-copy">Copy</button>
        <button class="btn btn--secondary" id="pin-csv">Download CSV</button>
        <button class="btn btn--primary" id="pin-print">Print</button>
      </div>`);
    const text = rows.map((r) => `${r.name}\tGrade ${r.grade}\t${r.pin}`).join('\n');
    modal.querySelector('#pin-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); showNotify('Copied.'); } catch { showNotify('Copy failed. Use Download CSV.', true); }
    });
    modal.querySelector('#pin-csv').addEventListener('click', () => {
      const csv = 'Name,Grade,PIN\n' + rows.map((r) => `"${String(r.name).replace(/"/g, '""')}",${r.grade},${r.pin}`).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = 'student-pins.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    modal.querySelector('#pin-print').addEventListener('click', () => {
      const w = window.open('', '_blank');
      if (!w) { showNotify('Pop-up blocked. Use Download CSV instead.', true); return; }
      w.document.write(`<!doctype html><title>Student PINs</title><style>body{font-family:sans-serif;padding:1rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:.5rem .75rem;text-align:left;font-size:16px}.pin{font-size:22px;font-weight:700;letter-spacing:.1em}</style>
        <h2>${esc(school.name ?? '')} — student PINs</h2><table><tr><th>Name</th><th>Grade</th><th>PIN</th></tr>
        ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(String(r.grade))}</td><td class="pin">${esc(r.pin)}</td></tr>`).join('')}</table>`);
      w.document.close(); w.focus(); w.print();
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
