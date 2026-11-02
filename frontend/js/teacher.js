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

  // Header: language switch, and the teacher's name and grade on their own row on phones
  mountLangToggle(document.getElementById('lang-toggle-wrap'));
  const gradeBadge = document.getElementById('teacher-grade');
  if (gradeBadge && session.grade) gradeBadge.textContent = `Grade ${session.grade}`;
  const whoEl = document.getElementById('student-name');
  if (whoEl && (session.name || session.grade)) {
    const label = session.grade ? `Grade ${session.grade}` : '';
    whoEl.innerHTML = `${session.name ? esc(session.name) : ''}${session.name && label ? ' ' : ''}${label ? `<span class="site-header__grade">${session.name ? '· ' : ''}${label}</span>` : ''}`;
    whoEl.classList.toggle('site-header__user--grade-only', !session.name);
    whoEl.hidden = false;
  }
  startStaffTranslation();
  document.getElementById('btn-logout').addEventListener('click', logout);

  let _notifyTimer;
  function showNotify(msg, isError = false) {
    notify.textContent = msg;
    notify.className   = `notification${isError ? ' notification--error' : ''}`;
    notify.hidden      = false;
    if (isError) console.error('[Academic Hub]', msg);   // also readable in the browser console
    clearTimeout(_notifyTimer);
    // Errors stay long enough to read and copy; tap one to close it
    _notifyTimer = setTimeout(() => { notify.hidden = true; }, isError ? 20000 : 3500);
  }
  notify.addEventListener('click', () => { notify.hidden = true; });

  function esc(str) { return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Cached ref data
  let subjects = [], terms = [];
  async function loadRefData() {
    let names = [];
    [subjects, terms, names] = await Promise.all([
      apiGet(`/subjects?school_id=${SCHOOL_SLUG}`).catch(() => []),
      apiGet(`/terms?school_id=${SCHOOL_SLUG}`).catch(() => []),
      apiGet(`/subjects?school_id=${SCHOOL_SLUG}&full=1`).catch(() => []),   // display names only; the list above is what this teacher may use
    ]);
    // Subject names are data, so the screen translator learns them here (English name → Afrikaans name)
    addStaffAf(Object.fromEntries(names.filter((s) => s.names?.af && s.names.en !== s.names.af).map((s) => [s.names.en, s.names.af])));
  }

  // ── Views: dashboard (per subject/grade) → subject detail → all posts ──
  let allPosts = [];
  let dash = [];                       // per grade+subject buckets from /dashboard/subjects
  let view = { name: 'dashboard' };    // { name: 'dashboard' } | { name:'subject', grade, subject } | { name:'all' }
  let adminGrade = '';                 // admin-only grade filter on the dashboard

  async function loadPosts() {
    main.innerHTML = '<p class="loading-text">Loading…</p>';
    await loadRefData();
    try {
      [allPosts, dash] = await Promise.all([
        apiGet(`/posts?school_id=${SCHOOL_SLUG}`),
        apiGet('/dashboard/subjects').catch(() => []),
      ]);
    } catch (e) {
      main.innerHTML = `<p style="color:red;padding:1rem">${esc(e.message)}</p>`; return;
    }
    renderView();
  }

  function renderView() {
    if (view.name === 'subject') renderSubject(view.grade, view.subject);
    else if (view.name === 'all') renderPostList(allPosts, { title: 'All Posts', back: true });
    else if (view.name === 'students') renderStudentsView();
    else renderDashboard();
  }

  const pctText = (v) => (v == null ? '–' : `${v}%`);

  function renderStudentsView() {
    main.innerHTML = `
      <div class="page-toolbar">
        <button id="btn-back-dash" class="btn btn--ghost btn--sm">&larr; Dashboard</button>
      </div>
      <div class="dash-wrap" id="students-panel"></div>`;
    document.getElementById('btn-back-dash').addEventListener('click', () => { view = { name: 'dashboard' }; renderView(); });
    StudentsUI.mount(document.getElementById('students-panel'), {
      school, role: session.role === 'teacher' ? 'teacher' : 'admin', grade: session.grade, notify: showNotify,
    });
  }

  function renderDashboard() {
    const isTeacher = session.role === 'teacher';
    const grades = [...new Set(dash.map((b) => b.grade))].sort((a, b) => a - b);
    const shown  = dash.filter((b) => isTeacher || !adminGrade || String(b.grade) === adminGrade);
    const multiGrade = new Set(shown.map((b) => b.grade)).size > 1;

    const tot = shown.reduce((t, b) => ({
      published: t.published + b.published, drafts: t.drafts + b.drafts,
      viewers: t.viewers + b.unique_viewers, attempts: t.attempts + b.attempts,
      scoreSum: t.scoreSum + (b.avg_score ?? 0) * b.attempts,
    }), { published: 0, drafts: 0, viewers: 0, attempts: 0, scoreSum: 0 });
    const overallAvg = tot.attempts ? Math.round(tot.scoreSum / tot.attempts) : null;

    let html = `
      <div class="page-toolbar">
        <h1 class="page-title">${isTeacher && session.grade ? `Grade ${esc(String(session.grade))} Dashboard` : 'Dashboard'}</h1>
        <div class="toolbar-actions">
          <button id="btn-students" class="btn btn--secondary">Students</button>
          <button id="btn-all-posts" class="btn btn--secondary">All Posts</button>
          <button id="btn-new-post" class="btn btn--primary">+ New Post</button>
        </div>
      </div>
      <div class="dash-wrap">`;

    if (!isTeacher && grades.length > 1) {
      html += `<div class="dash-filter"><label class="form-label" for="dash-grade">Grade</label>
        <select id="dash-grade" class="form-control">
          <option value="">All grades</option>
          ${grades.map((g) => `<option value="${g}" ${String(g) === adminGrade ? 'selected' : ''}>Grade ${g}</option>`).join('')}
        </select></div>`;
    }

    html += `<div class="dash-totals">
        <div class="stat-card"><span class="stat-card__value">${tot.published}</span><span class="stat-card__label">Published</span></div>
        <div class="stat-card"><span class="stat-card__value">${tot.drafts}</span><span class="stat-card__label">Drafts</span></div>
        <div class="stat-card"><span class="stat-card__value">${tot.viewers}</span><span class="stat-card__label">Student views</span></div>
        <div class="stat-card"><span class="stat-card__value">${pctText(overallAvg)}</span><span class="stat-card__label">Avg quiz score</span></div>
      </div>`;

    if (!shown.length) {
      html += '<p class="dash-empty">No posts yet. Tap “+ New Post” to get started.</p>';
    } else {
      html += '<div class="dash-grid">';
      shown.forEach((b) => {
        html += `
          <button class="dash-card" data-grade="${esc(String(b.grade))}" data-subject="${esc(b.subject)}">
            <span class="dash-card__head">
              <span class="dash-card__title">${esc(b.subject)}</span>
              ${(!isTeacher || multiGrade) ? `<span class="grade-badge">Grade ${esc(String(b.grade))}</span>` : ''}
            </span>
            <span class="dash-card__stats">
              <span><strong>${b.published}</strong> published</span>
              <span><strong>${b.drafts}</strong> draft${b.drafts === 1 ? '' : 's'}</span>
              <span><strong>${b.unique_viewers}</strong> viewers</span>
              <span><strong>${b.quizzes}</strong> quiz${b.quizzes === 1 ? '' : 'zes'}</span>
            </span>
            <span class="dash-card__foot">
              <span>Avg score <strong>${pctText(b.avg_score)}</strong></span>
              <span class="dash-card__go">View &rarr;</span>
            </span>
          </button>`;
      });
      html += '</div>';
    }
    html += '</div>';
    main.innerHTML = html;

    document.getElementById('btn-new-post').addEventListener('click', () => showEditor(null));
    document.getElementById('btn-all-posts').addEventListener('click', () => { view = { name: 'all' }; renderView(); });
    document.getElementById('btn-students').addEventListener('click', () => { view = { name: 'students' }; renderView(); });
    document.getElementById('dash-grade')?.addEventListener('change', (e) => { adminGrade = e.target.value; renderDashboard(); });
    main.querySelectorAll('.dash-card').forEach((el) => el.addEventListener('click', () => {
      view = { name: 'subject', grade: Number(el.dataset.grade), subject: el.dataset.subject };
      renderView();
    }));
  }

  function renderSubject(grade, subject) {
    const b = dash.find((x) => x.grade === grade && x.subject === subject);
    const posts = allPosts.filter((p) => Number(p.grade) === grade && (p.subject || 'Unassigned') === subject);
    const ps = (id) => b?.posts?.[id] ?? {};
    renderPostList(posts, {
      title: `${subject} · Grade ${grade}`,
      back: true,
      newDefaults: { grade, subject },
      summary: b ? `
        <div class="dash-totals">
          <div class="stat-card"><span class="stat-card__value">${b.published}</span><span class="stat-card__label">Published</span></div>
          <div class="stat-card"><span class="stat-card__value">${b.unique_viewers}</span><span class="stat-card__label">Unique viewers</span></div>
          <div class="stat-card"><span class="stat-card__value">${b.attempts}</span><span class="stat-card__label">Quiz attempts</span></div>
          <div class="stat-card"><span class="stat-card__value">${pctText(b.avg_score)}</span><span class="stat-card__label">Avg score</span></div>
          <div class="stat-card"><span class="stat-card__value">${pctText(b.pass_rate)}</span><span class="stat-card__label">Pass rate</span></div>
        </div>` : '',
      extraHead: '<th>Viewers</th><th>Attempts</th><th>Avg</th>',
      extraCells: (p) => `<td>${ps(p.id).unique_viewers ?? 0}</td><td>${ps(p.id).attempts ?? 0}</td><td>${pctText(ps(p.id).avg_score)}</td>`,
    });
  }

  function renderPostList(posts, opts = {}) {
    const extraHead = opts.extraHead ?? '';
    const cols = 8 + (opts.extraHead ? 3 : 0);
    let html = `
      <div class="page-toolbar">
        ${opts.back ? '<button id="btn-back-dash" class="btn btn--ghost btn--sm">&larr; Dashboard</button>' : ''}
        <h1 class="page-title">${esc(opts.title ?? 'Posts')}</h1>
        <button id="btn-new-post" class="btn btn--primary">+ New Post</button>
      </div>
      ${opts.summary ?? ''}
      <div class="table-scroll-wrap"><table class="table" id="posts-table">
        <thead><tr>
          <th>Title</th><th>Grade</th><th>Subject</th><th>Term</th>
          <th>Status</th>${extraHead}<th>Language</th><th>Author</th><th></th>
        </tr></thead>
        <tbody>`;

    if (!posts.length) {
      html += `<tr><td colspan="${cols}" style="text-align:center;color:#888;padding:2rem">No posts yet.</td></tr>`;
    }
    posts.forEach((p) => {
      html += `<tr>
        <td><a href="#" class="link-action" data-action="view" data-id="${esc(p.id)}">${esc(p.title)}</a>${altTitle(p)}</td>
        <td>${esc(String(p.grade))}</td>
        <td>${esc(p.subject)}</td>
        <td>${esc(p.term)}</td>
        <td><span class="badge badge--${p.status === 'published' ? 'published' : 'draft'}">${esc(p.status)}</span></td>
        ${opts.extraCells ? opts.extraCells(p) : ''}
        <td>${langChips(p)}</td>
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

    document.getElementById('btn-new-post').addEventListener('click', () => showEditor(null, opts.newDefaults));
    document.getElementById('btn-back-dash')?.addEventListener('click', () => { view = { name: 'dashboard' }; renderView(); });
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
      await loadPosts();
    } catch (e) { showNotify(e.message, true); }
  }

  // ── Editor ──────────────────────────────────────────────────
  let quillEditor = null;
  let quizQuestions = [];
  let quizEditors = {}; // idx -> Quill instance for each question

  function showEditor(post, defaults) {
    const isEdit   = !!post;
    const pre      = post ?? defaults ?? (session.role === 'teacher' && session.grade ? { grade: session.grade } : {});
    const canPublish = ['admin', 'super_admin'].includes(session.role) || isEdit;
    quizQuestions  = post ? ((() => { try { return JSON.parse(post.quiz_json || '[]'); } catch { return []; } })()) : [];

    const gradeOptions = (school.grades ?? [1,2,3,4,5,6,7]).map((g) =>
      `<option value="${g}" ${pre.grade == g ? 'selected' : ''}>Grade ${g}</option>`).join('');
    const subjectOptions = subjects.map((s) =>
      `<option value="${esc(s)}" ${pre.subject === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
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
          ${isEdit ? '<div id="lang-tabs-wrap"></div>' : ''}
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
            <label class="form-label">Language this post is written in *</label>
            <select id="f-lang" class="form-control" ${post?.translations && Object.keys(post.translations).length ? 'disabled title="Delete the translation to change this"' : ''}>
              <option value="en" ${(post?.lang ?? lastLang()) === 'en' ? 'selected' : ''}>English</option>
              <option value="af" ${(post?.lang ?? lastLang()) === 'af' ? 'selected' : ''}>Afrikaans</option>
            </select>
          </div>
          ${isEdit
            ? '<div id="translation-panel" class="tr-panel"></div>'
            : '<p class="tr-hint">Save the post first, then you can create the other language version with AI.</p>'}
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
        modules: { toolbar: {
          container: [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ color: [] }, { background: [] }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['blockquote', 'link', 'image', 'video'],
            ['clean'],
          ],
          handlers: {
            video() { quillInsertYouTube(quillEditor); },
            image() {
              const input = document.createElement('input');
              input.type = 'file'; input.accept = 'image/*'; input.click();
              input.onchange = () => {
                const file = input.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                  const range = quillEditor.getSelection(true);
                  quillEditor.insertEmbed(range ? range.index : 0, 'image', e.target.result);
                };
                reader.readAsDataURL(file);
              };
            },
          },
        }},
      });
      if (post?.content_html) {
        quillEditor.clipboard.dangerouslyPasteHTML(post.content_html);
      }
      attachImageResizePicker(quillEditor, () => { /* content saved on submit */ });
    });

    if (isEdit) { renderTranslationPanel(post); renderEditorTabs(post); }

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
      lang:    document.getElementById('f-lang')?.value || existingPost?.lang || 'en',
    };
  }

  async function savePost(existingPost, status) {
    const body = buildPostFromForm(existingPost);
    if (!body.title)   { showNotify('Title is required.', true); return; }
    if (!body.subject) { showNotify('Subject is required.', true); return; }
    if (!body.term)    { showNotify('Term is required.', true); return; }

    body.status = status;
    try { localStorage.setItem('hub_post_lang', body.lang); } catch {}
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

  // ── Translations (English ⇄ Afrikaans) ─────────────────────────
  const LANG_NAME = { en: 'English', af: 'Afrikaans' };
  const otherOf   = (l) => (l === 'en' ? 'af' : 'en');
  function lastLang() { try { return localStorage.getItem('hub_post_lang') || 'en'; } catch { return 'en'; } }

  // Other-language title shown under the main one (teachers see drafts too)
  function altTitle(p) {
    const other = otherOf(p.lang ?? 'en');
    const t = p.titles?.[other];
    return t ? `<div class="title-alt" lang="${other}">${esc(t)}</div>` : '';
  }

  // Language tabs: [English | Afrikaans] with state. The original opens the editor, the other opens its review screen.
  function langTabs(post, active) {
    const orig  = post.lang ?? 'en';
    const other = otherOf(orig);
    const t     = post.translations?.[other];
    const st    = !t ? 'none' : t.stale ? 'stale' : t.status;
    const mark  = { none: '＋', draft: '· draft', verified: '✓', stale: '⚠' }[st];
    const tab   = (l, on, extra) => `<button type="button" class="lang-tab ${on ? 'lang-tab--on' : ''}" data-lang-tab="${l}" aria-pressed="${on}">${LANG_NAME[l]}${extra ? ` <span class="lang-tab__mark lang-tab__mark--${st}">${extra}</span>` : ''}</button>`;
    return `<div class="lang-tabs" role="group" aria-label="Language">${tab(orig, active === orig, '')}${tab(other, active === other, mark)}</div>`;
  }

  function bindLangTabs(root, post, active) {
    root.querySelectorAll('[data-lang-tab]').forEach((b) => b.addEventListener('click', () => {
      const l = b.dataset.langTab;
      if (l === active) return;
      const orig = post.lang ?? 'en';
      if (l === orig) { document.querySelector('.tr-overlay')?.remove(); return; }
      if (post.translations?.[l]) { showTranslationModal(post, l); return; }
      document.querySelector('.tr-overlay')?.remove();
      const panel = document.getElementById('translation-panel');
      panel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      panel?.classList.add('tr-panel--flash'); setTimeout(() => panel?.classList.remove('tr-panel--flash'), 1500);
    }));
  }

  function langChips(p) {
    const orig  = p.lang ?? 'en';
    const other = otherOf(orig);
    const st    = p.translation_state?.[other] ?? 'none';
    const label = { none: '', draft: ' · AI draft', verified: ' ✓', stale: ' ⚠ re-check' }[st];
    return `<span class="lang-chip">${orig.toUpperCase()}</span>` +
      (st === 'none' ? '' : `<span class="lang-chip lang-chip--${st}">${other.toUpperCase()}${label}</span>`);
  }

  function renderEditorTabs(post) {
    const wrap = document.getElementById('lang-tabs-wrap');
    if (!wrap) return;
    wrap.innerHTML = langTabs(post, post.lang ?? 'en');
    bindLangTabs(wrap, post, post.lang ?? 'en');
  }

  function renderTranslationPanel(post) {
    const el = document.getElementById('translation-panel');
    if (!el) return;
    const orig  = post.lang ?? 'en';
    const other = otherOf(orig);
    const t     = post.translations?.[other];
    const st    = !t ? 'none' : t.stale ? 'stale' : t.status;
    const msg = {
      none:     `No ${LANG_NAME[other]} version yet. Students only see ${LANG_NAME[orig]}.`,
      draft:    `${t?.ai_generated ? 'AI draft' : 'Draft'} — <strong>not visible to students</strong> until you check it and mark it verified.`,
      verified: `✓ Verified${t?.verified_by_name ? ' by ' + esc(t.verified_by_name) : ''}. Students can switch to ${LANG_NAME[other]}.`,
      stale:    `⚠ The ${LANG_NAME[orig]} text changed after this was checked. <strong>Hidden from students</strong> until you re-check it.`,
    }[st];
    renderEditorTabs(post);
    el.className = `tr-panel tr-panel--${st}`;
    el.innerHTML = `
      <div class="tr-panel__title">${LANG_NAME[other]} version</div>
      <p class="tr-panel__msg">${msg}</p>
      <div class="tr-panel__actions">
        ${st === 'none' ? `
          <button class="btn btn--primary" data-tr="ai">✨ Generate with AI</button>
          <button class="btn btn--secondary" data-tr="manual">Write it myself</button>` : `
          <button class="btn btn--primary" data-tr="review">${st === 'verified' ? 'View / edit' : 'Review &amp; verify'}</button>
          <button class="btn btn--secondary" data-tr="ai">↻ Regenerate with AI</button>
          <button class="btn btn--ghost" data-tr="delete">Delete</button>`}
      </div>`;
    el.querySelectorAll('[data-tr]').forEach((b) => b.addEventListener('click', () => onTranslationAction(post, other, b.dataset.tr, b)));
  }

  async function refreshPost(id) {
    const fresh = await apiGet(`/posts/${id}`);
    const i = allPosts.findIndex((p) => p.id === id);
    if (i >= 0) allPosts[i] = { ...allPosts[i], ...fresh, translation_state: fresh.translation_state };
    return fresh;
  }

  async function onTranslationAction(post, target, action, btn) {
    try {
      if (action === 'delete') {
        if (!confirm(`Delete the ${LANG_NAME[target]} version?`)) return;
        await apiDelete(`/posts/${post.id}/translations/${target}`);
      } else if (action === 'ai') {
        const t = post.translations?.[target];
        if (t && !confirm(`Replace the current ${LANG_NAME[target]} version with a new AI translation? Your edits will be lost.`)) return;
        btn.disabled = true; btn.textContent = 'Translating… (up to 40s)';
        // Make sure AI translates exactly what is on screen, without changing publish status
        await apiPut(`/posts/${post.id}`, { ...buildPostFromForm(post), status: post.status });
        await apiPost(`/posts/${post.id}/translate`, { target });
        showNotify('AI draft ready. Please review it before marking it verified.');
      } else if (action === 'manual') {
        await apiPut(`/posts/${post.id}`, { ...buildPostFromForm(post), status: post.status });
      }
      const fresh = await refreshPost(post.id);
      renderTranslationPanel(fresh);
      if (action === 'ai' || action === 'review' || action === 'manual') showTranslationModal(fresh, target);
    } catch (e) {
      showNotify(e.message, true);
      renderTranslationPanel(post);
    }
  }

  function makeQuill(sel, full, initialHtml, placeholder) {
    const q = new Quill(sel, {
      theme: 'snow', placeholder,
      modules: { toolbar: {
        container: full
          ? [[{ header: [1, 2, 3, false] }], ['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link', 'image', 'video'], ['clean']]
          : [['bold', 'italic'], ['image']],
        handlers: { video() { quillInsertYouTube(q); }, image() {
          const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.click();
          input.onchange = () => {
            const f = input.files[0]; if (!f) return;
            const r = new FileReader();
            r.onload = (e) => { const range = q.getSelection(true); q.insertEmbed(range ? range.index : 0, 'image', e.target.result); };
            r.readAsDataURL(f);
          };
        } },
      } },
    });
    if (initialHtml) q.clipboard.dangerouslyPasteHTML(initialHtml);
    return q;
  }

  function showTranslationModal(post, lang) {
    document.querySelector('.tr-overlay')?.remove();
    const orig  = post.lang ?? 'en';
    const t     = post.translations?.[lang];
    const quiz  = (() => { try { return JSON.parse(post.quiz_json || '[]'); } catch { return []; } })();
    const view  = (html) => (String(html).includes('<') ? sanitize(html) : esc(html));

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay tr-overlay';
    overlay.innerHTML = `
      <div class="modal modal--wide">
        <div class="modal__header">
          <h2>${LANG_NAME[lang]} version</h2>
          <button class="btn btn--ghost btn--sm" id="tr-close">&times; Close</button>
        </div>
        <div class="modal__body">
          <div id="tr-tabs"></div>
          <p class="tr-note">${t?.ai_generated ? '✨ AI-generated draft. Read every part carefully — especially maths, names and quiz answers — before verifying.' : 'Write or paste the translation.'}
            Quiz answers stay the same: the correct option is taken from the ${LANG_NAME[orig]} quiz.</p>

          <div class="form-group">
            <label class="form-label">Title</label>
            <div class="tr-orig">${esc(post.title)}</div>
            <input id="tr-title" class="form-control" value="${esc(t?.title ?? '')}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Content</label>
            <details class="tr-orig-details"><summary>Show ${LANG_NAME[orig]} original</summary>
              <div class="tr-orig post-content">${sanitize(post.content_html ?? '')}</div></details>
            <div id="tr-content" style="min-height:240px;background:#fff"></div>
          </div>
          ${quiz.length ? `<h3 style="margin:1rem 0 .5rem">Quiz</h3>` : ''}
          ${quiz.map((q, i) => `
            <div class="tr-q">
              <div class="tr-q__n">Question ${i + 1}</div>
              <div class="tr-orig">${view(q.question ?? '')}</div>
              <div id="tr-q-${i}" style="background:#fff"></div>
              ${(q.options ?? []).map((o, oi) => `
                <div class="tr-opt ${q.correct_index === oi ? 'tr-opt--correct' : ''}">
                  <span class="tr-orig tr-opt__orig">${q.correct_index === oi ? '✓ ' : ''}${esc(o)}</span>
                  <input class="form-control tr-opt__in" data-q="${i}" data-o="${oi}" value="${esc(t?.quiz?.[i]?.options?.[oi] ?? '')}" placeholder="${esc(LANG_NAME[lang])} answer"/>
                </div>`).join('')}
            </div>`).join('')}

          <div class="tr-actions">
            <button class="btn btn--secondary" id="tr-save">Save draft</button>
            <button class="btn btn--primary" id="tr-verify">✓ Save &amp; mark verified</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#tr-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#tr-tabs').innerHTML = langTabs(post, lang);
    bindLangTabs(overlay.querySelector('#tr-tabs'), post, lang);

    let contentEd; const qEds = [];
    loadQuill(() => {
      contentEd = makeQuill('#tr-content', true, t?.content_html ?? '', `${LANG_NAME[lang]} content…`);
      quiz.forEach((_, i) => { qEds[i] = makeQuill(`#tr-q-${i}`, false, t?.quiz?.[i]?.question ?? '', `${LANG_NAME[lang]} question…`); });
    });

    async function save(verify) {
      if (!contentEd) return;
      const body = {
        title: overlay.querySelector('#tr-title').value.trim(),
        content_html: contentEd.root.innerHTML,
        quiz: quiz.map((q, i) => ({
          question: qEds[i].root.innerHTML,
          options: (q.options ?? []).map((_, oi) => overlay.querySelector(`.tr-opt__in[data-q="${i}"][data-o="${oi}"]`).value.trim()),
        })),
        verify,
      };
      if (!body.title) { showNotify('Title is required.', true); return; }
      if (verify && body.quiz.some((q) => q.options.some((o) => !o))) { showNotify('Fill in every quiz answer before verifying.', true); return; }
      const btns = overlay.querySelectorAll('#tr-save, #tr-verify');
      btns.forEach((b) => { b.disabled = true; });
      try {
        await apiPut(`/posts/${post.id}/translations/${lang}`, body);
        showNotify(verify ? 'Verified. Students can now switch language.' : 'Draft saved.');
        overlay.remove();
        renderTranslationPanel(await refreshPost(post.id));
      } catch (e) { showNotify(e.message, true); btns.forEach((b) => { b.disabled = false; }); }
    }
    overlay.querySelector('#tr-save').addEventListener('click', () => save(false));
    overlay.querySelector('#tr-verify').addEventListener('click', () => save(true));
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

      attachImageResizePicker(qed, () => { quizQuestions[idx].question = qed.root.innerHTML; });
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
  const sanitize = safeHtml;   // js/safe-html.js

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

  function attachImageResizePicker(qed, onResize) {
    qed.root.addEventListener('mousedown', (e) => {
      if (e.target.tagName !== 'IMG') return;
      e.preventDefault(); // prevent Quill caret placement interfering
      const img = e.target;
      document.querySelectorAll('.img-resize-bar').forEach((el) => el.remove());
      const bar = document.createElement('div');
      bar.className = 'img-resize-bar';
      bar.innerHTML = '<span style="font-size:.75rem;opacity:.7;margin-right:.5rem">Width:</span>' +
        ['25%','50%','75%','100%'].map((w) => `<button data-w="${w}">${w}</button>`).join('');
      bar.style.cssText = 'position:absolute;background:#fff;border:1px solid #ccc;border-radius:4px;padding:4px 6px;display:flex;align-items:center;gap:4px;z-index:100;box-shadow:0 2px 6px rgba(0,0,0,.15)';
      document.body.appendChild(bar);
      const r = img.getBoundingClientRect();
      bar.style.top  = `${r.bottom + window.scrollY + 4}px`;
      bar.style.left = `${r.left  + window.scrollX}px`;
      bar.querySelectorAll('button').forEach((btn) => {
        btn.style.cssText = 'padding:2px 6px;border:1px solid #ccc;border-radius:3px;background:#f5f5f5;cursor:pointer;font-size:.8rem';
        btn.addEventListener('click', () => {
          img.style.width = btn.dataset.w; img.style.height = 'auto';
          bar.remove();
          onResize();
        });
      });
      const dismiss = (ev) => { if (!bar.contains(ev.target) && ev.target !== img) { bar.remove(); document.removeEventListener('mousedown', dismiss); } };
      setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
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
