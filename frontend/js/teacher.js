/* teacher.js — teacher/admin post management with editor, quiz builder, preview, stats */
(async () => {
  const session = requireSession(['teacher', 'admin', 'super_admin']);
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
    document.title = `${school.name} — Teacher`;
    document.documentElement.style.setProperty('--primary', _color);
    document.getElementById('school-brand').textContent = school.name;
    sessionStorage.setItem(_brandKey, _color);
  } catch {}

  const gradeBadge = document.getElementById('teacher-grade');
  if (gradeBadge && session.grade) gradeBadge.textContent = `Grade ${session.grade}`;
  document.getElementById('btn-logout').addEventListener('click', logout);

  function showNotify(msg, isError = false) {
    notify.textContent = msg;
    notify.className   = `notification${isError ? ' notification--error' : ''}`;
    notify.hidden      = false;
    setTimeout(() => { notify.hidden = true; }, 3500);
  }

  function esc(str) { return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Cached ref data
  let subjects = [], terms = [];
  async function loadRefData() {
    [subjects, terms] = await Promise.all([
      apiGet(`/subjects?school_id=${SCHOOL_SLUG}`).catch(() => []),
      apiGet(`/terms?school_id=${SCHOOL_SLUG}`).catch(() => []),
    ]);
  }

  // ── Post list ───────────────────────────────────────────────
  let allPosts = [];

  async function loadPosts() {
    main.innerHTML = '<p class="loading-text">Loading posts…</p>';
    await loadRefData();
    try {
      allPosts = await apiGet(`/posts?school_id=${SCHOOL_SLUG}`);
    } catch (e) {
      main.innerHTML = `<p style="color:red;padding:1rem">${e.message}</p>`; return;
    }
    renderPostList();
  }

  function renderPostList() {
    let html = `
      <div class="page-toolbar">
        <h1 class="page-title">Posts</h1>
        <button id="btn-new-post" class="btn btn--primary">+ New Post</button>
      </div>
      <div class="table-scroll-wrap"><table class="table" id="posts-table">
        <thead><tr>
          <th>Title</th><th>Grade</th><th>Subject</th><th>Term</th>
          <th>Status</th><th>Author</th><th></th>
        </tr></thead>
        <tbody>`;

    if (!allPosts.length) {
      html += '<tr><td colspan="7" style="text-align:center;color:#888;padding:2rem">No posts yet.</td></tr>';
    }
    allPosts.forEach((p) => {
      html += `<tr>
        <td><a href="#" class="link-action" data-action="view" data-id="${esc(p.id)}">${esc(p.title)}</a></td>
        <td>${esc(String(p.grade))}</td>
        <td>${esc(p.subject)}</td>
        <td>${esc(p.term)}</td>
        <td><span class="badge badge--${p.status === 'published' ? 'published' : 'draft'}">${esc(p.status)}</span></td>
        <td>${esc(p.author_name ?? '')}</td>
        <td class="table-actions">
          <button class="btn btn--secondary btn--sm" data-action="preview" data-id="${esc(p.id)}">Preview</button>
          <button class="btn btn--secondary btn--sm" data-action="edit"    data-id="${esc(p.id)}">Edit</button>
          <button class="btn btn--secondary btn--sm" data-action="stats"   data-id="${esc(p.id)}">Stats</button>
          <button class="btn btn--danger    btn--sm" data-action="delete"  data-id="${esc(p.id)}">Delete</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    main.innerHTML = html;

    document.getElementById('btn-new-post').addEventListener('click', () => showEditor(null));
    main.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const id   = el.dataset.id;
        const post = allPosts.find((p) => p.id === id);
        if (el.dataset.action === 'edit')    apiGet(`/posts/${id}`).then(showEditor).catch(() => showEditor(post));
        if (el.dataset.action === 'view')    apiGet(`/posts/${id}`).then(showEditor).catch(() => showEditor(post));
        if (el.dataset.action === 'preview') apiGet(`/posts/${id}`).then(showPreview).catch(() => showPreview(post));
        if (el.dataset.action === 'stats')   showStats(id);
        if (el.dataset.action === 'delete')  deletePost(id);
      });
    });
  }

  // ── Delete ──────────────────────────────────────────────────
  async function deletePost(id) {
    const post = allPosts.find((p) => p.id === id);
    if (!confirm(`Delete "${post?.title}"?`)) return;
    try {
      await apiDelete(`/posts/${id}`);
      showNotify('Post deleted.');
      allPosts = allPosts.filter((p) => p.id !== id);
      renderPostList();
    } catch (e) { showNotify(e.message, true); }
  }

  // ── Editor ──────────────────────────────────────────────────
  let quillEditor = null;
  let quizQuestions = [];
  let quizEditors = {}; // idx -> Quill instance for each question

  function showEditor(post) {
    const isEdit   = !!post;
    const canPublish = ['admin', 'super_admin'].includes(session.role) || isEdit;
    quizQuestions  = post ? ((() => { try { return JSON.parse(post.quiz_json || '[]'); } catch { return []; } })()) : [];

    const gradeOptions = (school.grades ?? [1,2,3,4,5,6,7]).map((g) =>
      `<option value="${g}" ${post?.grade == g ? 'selected' : ''}>Grade ${g}</option>`).join('');
    const subjectOptions = subjects.map((s) =>
      `<option value="${esc(s)}" ${post?.subject === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    const termOptions = terms.map((t) =>
      `<option value="${esc(t)}" ${post?.term === t ? 'selected' : ''}>${esc(t)}</option>`).join('');

    main.innerHTML = `
      <div class="page-toolbar">
        <button id="btn-back-list" class="btn btn--ghost btn--sm">&larr; Back</button>
        <h1 class="page-title">${isEdit ? 'Edit Post' : 'New Post'}</h1>
        <div style="display:flex;gap:.5rem">
          <button id="btn-preview-editor" class="btn btn--secondary">Preview</button>
          <button id="btn-save-draft"    class="btn btn--secondary">Save Draft</button>
          <button id="btn-publish"       class="btn btn--primary">${isEdit && post.status === 'published' ? 'Update' : 'Publish'}</button>
        </div>
      </div>
      <div class="editor-layout">
        <div class="editor-left">
          <div class="form-group">
            <label class="form-label">Title *</label>
            <input id="f-title" class="form-control" value="${esc(post?.title ?? '')}" placeholder="Post title" required/>
          </div>
          <div class="editor-row-3">
            <div class="form-group">
              <label class="form-label">Grade *</label>
              <select id="f-grade" class="form-control">${gradeOptions}</select>
            </div>
            <div class="form-group">
              <label class="form-label">Subject *</label>
              <select id="f-subject" class="form-control"><option value="">Select…</option>${subjectOptions}</select>
            </div>
            <div class="form-group">
              <label class="form-label">Term *</label>
              <select id="f-term" class="form-control"><option value="">Select…</option>${termOptions}</select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Content</label>
            <div id="quill-editor" style="min-height:280px;background:#fff"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Attachments</label>
            <div id="attachments-list"></div>
            <label class="btn btn--secondary btn--sm" style="margin-top:.5rem;cursor:pointer">
              + Add File<input id="file-input" type="file" multiple style="display:none"/>
            </label>
          </div>
        </div>
        <div class="editor-right">
          <div class="quiz-builder">
            <div class="quiz-builder__header">
              <h3 class="quiz-builder__title">Quiz</h3>
              <button id="btn-add-question" class="btn btn--secondary btn--sm">+ Question</button>
            </div>
            <label class="quiz-hide-toggle" style="display:flex;align-items:center;gap:.5rem;margin:.5rem 0 .75rem;font-size:.85rem;cursor:pointer">
              <input type="checkbox" id="f-quiz-hide-content" ${post?.quiz_hide_content ? 'checked' : ''}/>
              Hide post content while quiz is active
            </label>
            <div id="quiz-questions"></div>
          </div>
        </div>
      </div>`;

    document.getElementById('btn-back-list').addEventListener('click', loadPosts);
    document.getElementById('btn-preview-editor').addEventListener('click', () => showPreview(buildPostFromForm(post)));
    document.getElementById('btn-save-draft').addEventListener('click', () => savePost(post, 'draft'));
    document.getElementById('btn-publish').addEventListener('click', () => savePost(post, 'published'));
    document.getElementById('btn-add-question').addEventListener('click', addQuestion);
    document.getElementById('file-input').addEventListener('change', (e) => {
      Array.from(e.target.files).forEach(uploadAttachment);
      e.target.value = '';
    });

    // Init Quill (load from CDN if not already loaded)
    loadQuill(() => {
      quillEditor = new Quill('#quill-editor', {
        theme: 'snow',
        placeholder: 'Write lesson content here…',
        modules: { toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['blockquote', 'link', 'image'],
          ['clean'],
        ]},
      });
      if (post?.content_html) {
        quillEditor.clipboard.dangerouslyPasteHTML(post.content_html);
      }
    });

    renderAttachments(post ? ((() => { try { return JSON.parse(post.attachments_json || '[]'); } catch { return []; } })()) : []);
    renderQuizBuilder();
  }

  function buildPostFromForm(existingPost) {
    return {
      ...(existingPost ?? {}),
      title:   document.getElementById('f-title')?.value.trim(),
      grade:   Number(document.getElementById('f-grade')?.value),
      subject: document.getElementById('f-subject')?.value,
      term:    document.getElementById('f-term')?.value,
      content_html:     quillEditor ? quillEditor.root.innerHTML : (existingPost?.content_html ?? ''),
      attachments_json: JSON.stringify(getAttachments()),
      quiz_json:        JSON.stringify(quizQuestions),
      quiz_hide_content: document.getElementById('f-quiz-hide-content')?.checked ?? false,
    };
  }

  async function savePost(existingPost, status) {
    const body = buildPostFromForm(existingPost);
    if (!body.title)   { showNotify('Title is required.', true); return; }
    if (!body.subject) { showNotify('Subject is required.', true); return; }
    if (!body.term)    { showNotify('Term is required.', true); return; }

    body.status = status;
    const btn = document.getElementById(status === 'draft' ? 'btn-save-draft' : 'btn-publish');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      if (existingPost?.id) {
        await apiPut(`/posts/${existingPost.id}`, body);
      } else {
        await apiPost('/posts', body);
      }
      showNotify(status === 'published' ? 'Post published!' : 'Draft saved.');
      await loadPosts();
    } catch (e) {
      showNotify(e.message, true);
      if (btn) { btn.disabled = false; btn.textContent = status === 'draft' ? 'Save Draft' : 'Publish'; }
    }
  }

  // ── Attachments ─────────────────────────────────────────────
  // Stored as [{name, driveId}] — Drive is invisible to teachers/students
  let pendingAttachments = []; // [{name, driveId}]

  function getAttachments() { return pendingAttachments.filter((a) => a.driveId); }

  function renderAttachments(saved) {
    pendingAttachments = saved.map((a) =>
      typeof a === 'string' ? { name: a, driveId: a } : a  // backward-compat with old URL strings
    );
    refreshAttachmentList();
  }

  function refreshAttachmentList() {
    const list = document.getElementById('attachments-list');
    if (!list) return;
    list.innerHTML = '';
    pendingAttachments.forEach((att, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem';
      if (att.driveId) {
        row.innerHTML = `<span style="flex:1;font-size:.875rem">📎 ${esc(att.name)}</span>
          <button class="btn btn--danger btn--sm" data-idx="${i}" type="button">&times;</button>`;
      } else {
        row.innerHTML = `<span style="flex:1;font-size:.875rem;color:#888">⏳ ${esc(att.name)}</span>
          <div class="upload-progress" style="width:80px;height:6px;background:#eee;border-radius:3px">
            <div class="upload-progress__bar" data-idx="${i}" style="height:100%;background:var(--primary);border-radius:3px;width:0%"></div>
          </div>`;
      }
      row.querySelector('button')?.addEventListener('click', () => {
        pendingAttachments.splice(i, 1);
        refreshAttachmentList();
      });
      list.appendChild(row);
    });
  }

  const SMALL_FILE_THRESHOLD = 4 * 1024 * 1024; // 4 MB

  async function uploadAttachment(file) {
    const grade   = Number(document.getElementById('f-grade')?.value);
    const subject = document.getElementById('f-subject')?.value;
    if (!grade || !subject) { showNotify('Select grade and subject before uploading files.', true); return; }

    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? 2 * 1024 * 1024 * 1024 : 500 * 1024 * 1024;
    if (file.size > maxSize) {
      showNotify(`${file.name} is too large (max ${isVideo ? '2 GB' : '500 MB'}).`, true);
      return;
    }

    const idx = pendingAttachments.length;
    pendingAttachments.push({ name: file.name, driveId: null });
    refreshAttachmentList();

    function setProgress(pct) {
      const bar = document.querySelector(`.upload-progress__bar[data-idx="${idx}"]`);
      if (bar) bar.style.width = `${pct}%`;
    }

    try {
      // Step 1: get pre-authenticated Drive upload URL from our API
      const { uploadUrl } = await apiPost('/files/upload-session', {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileSize: file.size,
        grade, subject,
      });

      let driveId;
      const useDirect = isVideo || file.size > SMALL_FILE_THRESHOLD;

      if (useDirect) {
        // Step 2a: PUT file DIRECTLY from browser to Drive — no JSON payload limits
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10 * 60 * 1000); // 10 min timeout
        try {
          const res = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
            signal: ctrl.signal,
          });
          if (!res.ok) throw new Error(`Upload failed (${res.status})`);
          const data = await res.json();
          driveId = data.id;
        } finally {
          clearTimeout(timer);
        }
      } else {
        // Step 2b: small files — proxy through API in 4 MB base64 chunks
        const CHUNK = 4 * 1024 * 1024;
        let offset = 0;
        while (offset < file.size) {
          const slice  = file.slice(offset, offset + CHUNK);
          const base64 = await blobToBase64(slice);
          const result = await apiPost('/files/upload-chunk', {
            uploadUrl, base64,
            mimeType: file.type || 'application/octet-stream',
            offset, totalSize: file.size,
          });
          offset += slice.size;
          setProgress(Math.round((offset / file.size) * 90));
          if (result.done) { driveId = result.driveId; break; }
        }
      }

      if (!driveId) throw new Error('Drive did not return a file ID.');

      // Step 3: make publicly readable via our API
      await apiPost('/files/finalize', { driveId });
      setProgress(100);

      pendingAttachments[idx] = { name: file.name, driveId };
      refreshAttachmentList();
    } catch (e) {
      pendingAttachments.splice(idx, 1);
      refreshAttachmentList();
      showNotify(`Upload failed: ${e.message}`, true);
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ── Quiz builder ─────────────────────────────────────────────
  function renderQuizBuilder() {
    quizEditors = {}; // old Quill instances orphaned — let GC clean up
    const container = document.getElementById('quiz-questions');
    container.innerHTML = '';
    if (!quizQuestions.length) {
      container.innerHTML = '<p style="color:#888;font-size:.85rem;text-align:center">No questions yet.</p>';
      return;
    }
    quizQuestions.forEach((q, i) => renderQuestion(q, i));
  }

  function renderQuestion(q, idx) {
    const container = document.getElementById('quiz-questions');
    const div       = document.createElement('div');
    div.className   = 'quiz-q-card';
    div.dataset.idx = idx;
    div.innerHTML   = `
      <div class="quiz-q-card__header">
        <span class="quiz-q-card__num">Q${idx + 1}</span>
        <button class="btn btn--danger btn--sm quiz-q-del" data-idx="${idx}">&times;</button>
      </div>
      <div class="quiz-q-editor" id="quiz-q-editor-${idx}" style="min-height:70px;background:#fff;margin-bottom:.5rem"></div>
      <div class="quiz-q-options">
        ${(q.options || ['', '', '', '']).map((opt, oi) => `
          <div class="quiz-opt-row">
            <input type="radio" name="correct-${idx}" value="${oi}" ${q.correct_index === oi ? 'checked' : ''}/>
            <input class="form-control" type="text" value="${esc(opt)}" placeholder="Option ${oi + 1}"/>
          </div>`).join('')}
      </div>
      <p style="font-size:.75rem;color:#888;margin-top:.25rem">Select the correct answer with the radio button.</p>`;

    div.querySelectorAll('.quiz-opt-row').forEach((row, oi) => {
      row.querySelector('input[type="text"]').addEventListener('input', (e) => {
        if (!quizQuestions[idx].options) quizQuestions[idx].options = [];
        quizQuestions[idx].options[oi] = e.target.value;
      });
      row.querySelector('input[type="radio"]').addEventListener('change', () => { quizQuestions[idx].correct_index = oi; });
    });
    div.querySelector('.quiz-q-del').addEventListener('click', () => {
      quizQuestions.splice(idx, 1);
      renderQuizBuilder();
    });
    container.appendChild(div);

    // Quill rich text editor for question (supports image embedding)
    loadQuill(() => {
      const qed = new Quill(`#quiz-q-editor-${idx}`, {
        theme: 'snow',
        placeholder: 'Question text (tap 🖼 to add an image)…',
        modules: {
          toolbar: {
            container: [['bold', 'italic'], ['image']],
            handlers: {
              image() {
                const input = document.createElement('input');
                input.type  = 'file';
                input.accept = 'image/*';
                input.click();
                input.onchange = () => {
                  const file = input.files[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    const range = qed.getSelection(true);
                    qed.insertEmbed(range ? range.index : 0, 'image', e.target.result);
                  };
                  reader.readAsDataURL(file);
                };
              },
            },
          },
        },
      });
      if (q.question) qed.clipboard.dangerouslyPasteHTML(q.question);
      qed.on('text-change', () => { quizQuestions[idx].question = qed.root.innerHTML; });
      quizEditors[idx] = qed;
    });
  }

  function addQuestion() {
    quizQuestions.push({ question: '', options: ['', '', '', ''], correct_index: 0 });
    renderQuizBuilder();
    document.querySelector(`[data-idx="${quizQuestions.length - 1}"] .quiz-q-text`)?.focus();
  }

  // ── Preview ─────────────────────────────────────────────────
  function showPreview(post) {
    const questions = (() => { try { return JSON.parse(post?.quiz_json || '[]'); } catch { return []; } })();
    const links     = (() => { try { return JSON.parse(post?.attachments_json || '[]'); } catch { return []; } })();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'modal modal--wide';
    modal.innerHTML = `
        <div class="modal__header">
          <h2>${esc(post?.title ?? 'Preview')}</h2>
          <span class="badge badge--draft" style="font-size:.7rem">Student view</span>
          <button class="btn btn--ghost btn--sm btn-fullscreen" title="Fullscreen" style="margin-left:auto">⛶</button>
          <button id="btn-close-preview" class="btn btn--ghost btn--sm">&times; Close</button>
        </div>
        <div class="modal__body">
          <p class="post-view__meta">Grade ${esc(String(post?.grade ?? ''))} &bull; ${esc(post?.subject ?? '')} &bull; Term ${esc(post?.term ?? '')}</p>
          <div class="post-content">${sanitize(post?.content_html ?? '')}</div>
          ${links.length ? `<div class="attachments"><h4>Attachments</h4>${links.map((a) => renderAttachmentItem(a)).join('')}</div>` : ''}
          ${questions.length ? `<div class="quiz-card"><h3 class="quiz-title">Quiz</h3>${questions.map((q, i) => `
            <div class="quiz-question"><div class="quiz-question__text"><strong>Q${i+1}.</strong> ${q.question?.includes('<') ? sanitize(q.question) : esc(q.question ?? '')}</div>
            <div class="quiz-options">${(q.options||[]).map((o, oi) => `<label class="quiz-option"><input type="radio" name="pq${i}" value="${oi}"/><span>${esc(o)}</span></label>`).join('')}</div>
            </div>`).join('')}
            <button class="btn btn--primary" style="margin-top:1rem" disabled>Submit Quiz</button>
          </div>` : ''}
        </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    addFullscreenToggle(overlay, modal);
    overlay.querySelector('#btn-close-preview').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  // ── Stats panel ─────────────────────────────────────────────
  async function showStats(id) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'modal modal--wide';
    modal.innerHTML = `
        <div class="modal__header">
          <h2>Post Stats</h2>
          <button class="btn btn--ghost btn--sm btn-fullscreen" title="Fullscreen" style="margin-left:auto">⛶</button>
          <button id="btn-close-stats" class="btn btn--ghost btn--sm">&times; Close</button>
        </div>
        <div class="modal__body" id="stats-body"><p class="loading-text">Loading…</p></div>`;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    addFullscreenToggle(overlay, modal);
    overlay.querySelector('#btn-close-stats').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    try {
      const [stats, viewers, attempts] = await Promise.all([
        apiGet(`/posts/${id}/stats`),
        apiGet(`/posts/${id}/viewers`),
        apiGet(`/posts/${id}/quiz-results`),
      ]);

      const body = document.getElementById('stats-body');
      body.innerHTML = `
        <div class="stats-summary">
          <div class="stat-card"><span class="stat-card__value">${stats.unique_viewers ?? 0}</span><span class="stat-card__label">Unique Viewers</span></div>
          <div class="stat-card"><span class="stat-card__value">${stats.quiz_attempts ?? 0}</span><span class="stat-card__label">Quiz Attempts</span></div>
          ${stats.avg_score != null ? `<div class="stat-card"><span class="stat-card__value">${stats.avg_score}%</span><span class="stat-card__label">Avg Score</span></div>` : ''}
          ${stats.pass_rate != null ? `<div class="stat-card"><span class="stat-card__value">${stats.pass_rate}%</span><span class="stat-card__label">Pass Rate</span></div>` : ''}
        </div>
        <div style="display:flex;gap:.5rem;margin:1rem 0">
          <button id="btn-export-viewers" class="btn btn--secondary btn--sm">Export Viewers (Excel)</button>
          ${attempts.length ? `<button id="btn-export-quiz" class="btn btn--secondary btn--sm">Export Quiz Results (Excel)</button>` : ''}
        </div>
        ${viewers.length ? `
          <h3 style="margin-bottom:.5rem">Viewers</h3>
          <table class="table table--sm">
            <thead><tr><th>Student</th><th>Grade</th><th>Opened At</th></tr></thead>
            <tbody>${viewers.map((v) => `<tr><td>${esc(v.student_name)}</td><td>${esc(String(v.grade))}</td><td>${new Date(v.timestamp).toLocaleString()}</td></tr>`).join('')}</tbody>
          </table>` : '<p style="color:#888">No views tracked yet.</p>'}
        ${attempts.length ? `
          <h3 style="margin:1rem 0 .5rem">Quiz Results</h3>
          <table class="table table--sm">
            <thead><tr><th>Student</th><th>Grade</th><th>Score</th><th>%</th><th>Passed</th><th>Attempt</th></tr></thead>
            <tbody>${attempts.map((a) => `<tr>
              <td>${esc(a.student_name)}</td><td>${esc(String(a.grade))}</td>
              <td>${a.score}/${a.total}</td><td>${a.percentage}%</td>
              <td>${a.passed ? '✓' : '✗'}</td><td>#${a.attempt_number}</td>
            </tr>`).join('')}</tbody>
          </table>` : ''}`;

      document.getElementById('btn-export-viewers')?.addEventListener('click', () =>
        downloadExport(`/admin/export/post/${id}/viewers`, `viewers-${id}.xlsx`));
      document.getElementById('btn-export-quiz')?.addEventListener('click', () =>
        downloadExport(`/admin/export/post/${id}/quiz`, `quiz-${id}.xlsx`));
    } catch (e) {
      document.getElementById('stats-body').innerHTML = `<p style="color:red">${e.message}</p>`;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────
  function sanitize(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('script,iframe,object,embed').forEach((el) => el.remove());
    return div.innerHTML;
  }

  function renderAttachmentItem(a) {
    const name        = typeof a === 'string' ? a : a.name;
    const rawId       = typeof a === 'string' ? a : a.driveId;
    const isDriveId   = rawId && !rawId.startsWith('http');
    const previewUrl  = isDriveId ? `/api/files/${encodeURIComponent(rawId)}?t=${encodeURIComponent(getToken() ?? '')}` : rawId;
    const downloadUrl = isDriveId ? `https://drive.google.com/uc?id=${encodeURIComponent(rawId)}&export=download` : rawId;
    return `<div class="attachment-item">
      <details class="attachment-expander">
        <summary>📎 ${esc(name)}<span style="font-size:.75rem;font-weight:400;opacity:.7;margin-left:.5rem">Tap to view</span></summary>
        <iframe src="${esc(previewUrl)}" class="attachment-frame" allowfullscreen loading="lazy"></iframe>
      </details>
      <a href="${esc(downloadUrl)}" target="_blank" rel="noopener" class="attachment-dl" title="Download">⬇</a>
    </div>`;
  }

  function addFullscreenToggle(overlay, modal) {
    const btn = overlay.querySelector('.btn-fullscreen');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const fs = modal.classList.toggle('modal--fullscreen');
      overlay.classList.toggle('modal-overlay--fullscreen', fs);
      btn.textContent = fs ? '⊡' : '⛶';
      btn.title = fs ? 'Exit fullscreen' : 'Fullscreen';
    });
  }

  // ── Quill loader ─────────────────────────────────────────────
  function loadQuill(cb) {
    if (window.Quill) { cb(); return; }
    const link  = document.createElement('link');
    link.rel    = 'stylesheet';
    link.href   = 'https://cdn.quilljs.com/1.3.7/quill.snow.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src   = 'https://cdn.quilljs.com/1.3.7/quill.min.js';
    script.onload = cb;
    document.head.appendChild(script);
  }

  await loadPosts();
})();
