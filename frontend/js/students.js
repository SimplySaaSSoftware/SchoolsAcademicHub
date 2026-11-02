/* students.js — shared Students panel (individual PINs). Used by the admin and teacher portals.
   Teachers: own grade only, can add, import and reset PINs. Admins: everything. */
const StudentsUI = (() => {
  let el, ctx, school;
  const isTeacher = () => ctx.role === 'teacher';
  const showNotify = (m, e) => ctx.notify(m, e);
  const tabEl = () => el;
  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

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

  let studentFilter = { grade: '', q: '' };
  let subjectList = [];   // [{ name, names: { en, af } }]
  const subjectLabel = (name) => subjectList.find((x) => x.name === name)?.names.en ?? name;

  async function renderStudents() {
    let students;
    try { [students, subjectList] = await Promise.all([apiGet('/students'), apiGet(`/subjects?school_id=${SCHOOL_SLUG}&full=1`).catch(() => [])]); }
    catch (e) { el.innerHTML = `<p style="color:red">${esc(e.message)}</p>`; return; }

    const grades = isTeacher() ? [ctx.grade] : (school.grades ?? [1,2,3,4,5,6,7]);
    const shown = students.filter((s) =>
      (!studentFilter.grade || String(s.grade) === studentFilter.grade) &&
      (!studentFilter.q || s.name.toLowerCase().includes(studentFilter.q.toLowerCase())));

    let html = `
      <div class="page-toolbar" style="margin-bottom:1rem">
        <h2 style="margin:0">Students <span style="font-weight:400;color:#888;font-size:.9375rem">(${shown.length}${shown.length !== students.length ? ` of ${students.length}` : ''})</span></h2>
        <div class="toolbar-actions">
          <button id="btn-export-students" class="btn btn--secondary">⬇ Export Excel</button>
          <button id="btn-import-students" class="btn btn--secondary">⬆ Import Excel</button>
          <button id="btn-add-student" class="btn btn--primary">+ Add Student</button>
        </div>
      </div>
 ${isTeacher() ? '' : `<div class="student-filters">
        <select id="st-grade" class="form-control" aria-label="Grade">
          <option value="">All grades</option>
          ${grades.map((g) => `<option value="${g}" ${String(g) === studentFilter.grade ? 'selected' : ''}>Grade ${g}</option>`).join('')}
        </select>
        <input id="st-search" class="form-control" type="search" placeholder="Search name…" value="${esc(studentFilter.q)}"/>
      </div>`}
      ${isTeacher() ? `<div class="student-filters"><input id="st-search" class="form-control" type="search" placeholder="Search name…" value="${esc(studentFilter.q)}"/></div>` : ''}
      <p style="color:#888;font-size:.9375rem;margin:.5rem 0 1rem">PINs are shown once, when created or reset. They are not stored, so use <strong>Reset PIN</strong> if one is lost.</p>
      <div class="student-list">`;
    if (!shown.length) html += `<p class="dash-empty">${students.length ? 'No students match.' : 'No students yet. Add one, or import an Excel file.'}</p>`;
    shown.forEach((s) => {
      html += `<div class="student-row ${s.active ? '' : 'student-row--off'}">
        <div class="student-row__info">
          <div class="student-row__name">${esc(s.name)}</div>
          <div class="student-row__meta">Grade ${esc(String(s.grade))}${s.active ? '' : ' · Inactive'}</div>
          <div class="student-row__meta">${s.subjects?.length ? esc(s.subjects.map(subjectLabel).join(', ')) : 'All subjects'}</div>
        </div>
        <div class="student-row__actions">
          <button class="btn btn--secondary btn--sm" data-st="reset" data-id="${esc(s.id)}">Reset PIN</button>
          ${isTeacher() ? '' : `<button class="btn btn--secondary btn--sm" data-st="edit" data-id="${esc(s.id)}">Edit</button>
          ${s.active
            ? `<button class="btn btn--danger btn--sm" data-st="deact" data-id="${esc(s.id)}">Deactivate</button>`
            : `<button class="btn btn--danger btn--sm" data-st="del" data-id="${esc(s.id)}">Delete</button>`}`}
        </div>
      </div>`;
    });
    html += '</div>';
    el.innerHTML = html;

    document.getElementById('st-grade')?.addEventListener('change', (e) => { studentFilter.grade = e.target.value; renderStudents(); });
    let t; document.getElementById('st-search').addEventListener('input', (e) => {
      studentFilter.q = e.target.value; clearTimeout(t);
      t = setTimeout(async () => { await renderStudents(); const el = document.getElementById('st-search'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250);
    });
    document.getElementById('btn-add-student').addEventListener('click', () => showStudentModal(null));
    document.getElementById('btn-import-students').addEventListener('click', pickImportFile);
    document.getElementById('btn-export-students').addEventListener('click', exportExcel);
    el.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', async () => {
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
    const gradeOpts = (isTeacher() ? [ctx.grade] : (school.grades ?? [1,2,3,4,5,6,7])).map((g) =>
      `<option value="${g}" ${student?.grade == g ? 'selected' : ''}>Grade ${g}</option>`).join('');
    const modal = createModal(`${isEdit ? 'Edit' : 'Add'} Student`, `
      <div class="form-group"><label class="form-label">Full name *</label>
        <input id="s-name" class="form-control" value="${esc(student?.name ?? '')}" autocomplete="off"/></div>
      <div class="form-group"><label class="form-label">Grade *</label>
        <select id="s-grade" class="form-control">${gradeOpts}</select></div>
      <div class="form-group"><label class="form-label">Subjects</label>
        ${subjectList.length ? `<div class="subject-picker">${subjectList.map((x) => `
          <label class="subject-picker__item"><input type="checkbox" value="${esc(x.name)}" ${(student?.subjects ?? []).includes(x.name) ? 'checked' : ''}/> <span>${esc(x.names.en)}</span></label>`).join('')}</div>
          <p style="color:#888;font-size:.875rem;margin-top:.35rem">Tick none to give the student every subject for their grade.</p>` : '<p style="color:#888;font-size:.9375rem">No subjects set up yet.</p>'}</div>
      <button id="btn-save-student" class="btn btn--primary" style="width:100%">${isEdit ? 'Update' : 'Create &amp; show PIN'}</button>`);
    modal.querySelector('#btn-save-student').addEventListener('click', async () => {
      const body = {
        name: modal.querySelector('#s-name').value.trim(), grade: Number(modal.querySelector('#s-grade').value),
        subjects: [...modal.querySelectorAll('.subject-picker input:checked')].map((i) => i.value),
      };
      if (!body.name) { showNotify('Name is required.', true); return; }
      try {
        if (isEdit) { await apiPut(`/students/${student.id}`, body); modal.remove(); showNotify('Student updated.'); renderStudents(); }
        else { const r = await apiPost('/students', body); modal.remove(); renderStudents(); showPinSheet('Student created', [r]); }
      } catch (e) { showNotify(e.message, true); }
    });
  }

  // ── Excel: export, then edit, then import ────────────────────
  async function exportExcel() {
    try {
      const grade = !isTeacher() && studentFilter.grade ? `?grade=${studentFilter.grade}` : '';
      await downloadExport(`/student-sheet/export${grade}`, `students${studentFilter.grade ? '-grade-' + studentFilter.grade : ''}.xlsx`);
      showNotify('Downloaded. Edit it in Excel, then use Import Excel.');
    } catch (e) { showNotify(e.message || 'Export failed', true); }
  }

  function pickImportFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.onchange = () => { if (input.files[0]) reviewImport(input.files[0]); };
    input.click();
  }

  const uploadSheet = (buf, dry) => apiFetch(`/student-sheet/import${dry ? '?dry=1' : ''}`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf,
  });

  // Step 1: check the file without saving anything
  async function reviewImport(file) {
    showNotify('Checking file…');
    let buf, r;
    try { buf = await file.arrayBuffer(); r = await uploadSheet(buf, true); }
    catch (e) { showNotify(e.message, true); return; }

    const bad = r.errors.length > 0;
    const list = (items, fmt) => items.length ? `<div class="pin-list" style="max-height:30vh;margin:.4rem 0 1rem">${items.map((x) => `<div class="pin-row" style="min-height:44px"><div>${fmt(x)}</div></div>`).join('')}</div>` : '';
    const modal = createModal('Check before saving', `
      <div class="import-counts">
        <div><strong>${r.creates.length}</strong><span>new</span></div>
        <div><strong>${r.updates.length}</strong><span>changed</span></div>
        <div><strong>${r.unchanged}</strong><span>same</span></div>
        <div class="${bad ? 'import-counts--bad' : ''}"><strong>${r.errors.length}</strong><span>problems</span></div>
      </div>
      ${bad ? `<p style="color:#a33;margin:.5rem 0"><strong>Nothing has been saved.</strong> Fix these rows in Excel and import again:</p>
        ${list(r.errors, (e) => `<strong>Row ${e.row}</strong> — ${esc(e.message)}`)}` : ''}
      ${r.warnings.length ? `<p style="color:#7a5b00;font-size:.9375rem">${r.warnings.map(esc).join('<br>')}</p>` : ''}
      ${!bad && r.creates.length ? `<p style="margin:.5rem 0 0"><strong>New students</strong> (each gets a PIN)</p>${list(r.creates, (c) => `${esc(c.name)} · Grade ${c.grade}`)}` : ''}
      ${!bad && r.updates.length ? `<p style="margin:.5rem 0 0"><strong>Changed</strong></p>${list(r.updates, (u) => `${esc(u.name)} <span style="color:#888">— ${esc(u.changes.join(', '))}</span>`)}` : ''}
      ${!bad && !r.creates.length && !r.updates.length ? '<p>Nothing to change. The file matches what is already saved.</p>' : ''}
      ${!bad && (r.creates.length || r.updates.length) ? '<button id="btn-apply-import" class="btn btn--primary" style="width:100%">Save these changes</button>' : ''}`);

    modal.querySelector('#btn-apply-import')?.addEventListener('click', async (ev) => {
      ev.target.disabled = true; ev.target.textContent = 'Saving…';
      try {
        const done = await uploadSheet(buf, false);
        modal.remove();
        renderStudents();
        if (done.created?.length) showPinSheet(`${done.created.length} new student${done.created.length === 1 ? '' : 's'} added`, done.created);
        else showNotify('Saved.');
      } catch (e) { showNotify(e.message, true); ev.target.disabled = false; ev.target.textContent = 'Save these changes'; }
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


  /** ctx: { school, role: 'admin'|'teacher', grade, notify(msg, isError) } */
  function mount(container, context) {
    el = container; ctx = context; school = ctx.school ?? {};
    return renderStudents();
  }

  return { mount };
})();
