/* channels.js — Communication Channels UI for teacher and student portals */

// ── Shared helpers ────────────────────────────────────────────────────────────
const ChEsc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const ChFmt = (d) => { const dt = new Date(d); return isNaN(dt) ? '' : dt.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }); };

// ── Teacher Channels UI ───────────────────────────────────────────────────────
const ChannelsTeacher = (() => {
  let _main, _session, _school, _notify, _quillInst;
  let _channels = [], _events = [];
  let _editingPost = null;   // null = new post
  let _activeChannelId = null;

  function mount(main, session, school, notify) {
    _main = main; _session = session; _school = school; _notify = notify;
    renderList();
  }

  async function renderList() {
    _main.innerHTML = '<p class="loading-text">Loading channels…</p>';
    try {
      [_channels, _events] = await Promise.all([
        apiGet(`/channels?school_id=${SCHOOL_SLUG}`),
        apiGet(`/calendar-events?school_id=${SCHOOL_SLUG}`).catch(() => []),
      ]);
    } catch (e) { _main.innerHTML = `<p style="color:red;padding:1rem">${ChEsc(e.message)}</p>`; return; }

    const topLevel = _channels.filter((c) => !c.parent_id);
    const subs = (parentId) => _channels.filter((c) => c.parent_id === parentId);

    let html = `
      <div class="channel-layout">
        <div class="channel-tree" id="channel-tree">
          <div class="channel-tree__head">
            <span class="channel-tree__title">Channels</span>
            <button id="ch-btn-new" class="btn btn--primary btn--sm">+ New</button>
          </div>`;

    if (!topLevel.length) {
      html += '<p class="dash-empty">No channels yet. Create one to get started.</p>';
    } else {
      topLevel.forEach((ch) => {
        const isActive = _activeChannelId === ch.id;
        html += `
          <div class="channel-item${isActive ? ' channel-item--active' : ''}" data-cid="${ChEsc(ch.id)}">
            <span class="channel-item__name">${ChEsc(ch.name)}</span>
            <span class="channel-item__actions">
              <button class="btn btn--ghost btn--xs" data-action="add-sub" data-cid="${ChEsc(ch.id)}" title="Add sub-channel">+ Sub</button>
              <button class="btn btn--ghost btn--xs" data-action="rename"  data-cid="${ChEsc(ch.id)}" title="Rename">✎</button>
              <button class="btn btn--ghost btn--xs" data-action="del-ch"  data-cid="${ChEsc(ch.id)}" title="Delete">✕</button>
            </span>
          </div>`;
        subs(ch.id).forEach((sub) => {
          const isSubActive = _activeChannelId === sub.id;
          html += `
            <div class="channel-item channel-item--sub${isSubActive ? ' channel-item--active' : ''}" data-cid="${ChEsc(sub.id)}">
              <span class="channel-item__name">${ChEsc(sub.name)}</span>
              <span class="channel-item__actions">
                <button class="btn btn--ghost btn--xs" data-action="add-sub" data-cid="${ChEsc(sub.id)}" title="Add sub-channel">+ Sub</button>
                <button class="btn btn--ghost btn--xs" data-action="rename" data-cid="${ChEsc(sub.id)}" title="Rename">✎</button>
                <button class="btn btn--ghost btn--xs" data-action="del-ch" data-cid="${ChEsc(sub.id)}" title="Delete">✕</button>
              </span>
            </div>`;
          subs(sub.id).forEach((sub2) => {
            const isSub2Active = _activeChannelId === sub2.id;
            html += `
              <div class="channel-item channel-item--sub channel-item--sub2${isSub2Active ? ' channel-item--active' : ''}" data-cid="${ChEsc(sub2.id)}">
                <span class="channel-item__name">${ChEsc(sub2.name)}</span>
                <span class="channel-item__actions">
                  <button class="btn btn--ghost btn--xs" data-action="add-sub" data-cid="${ChEsc(sub2.id)}" title="Add sub-channel">+ Sub</button>
                  <button class="btn btn--ghost btn--xs" data-action="rename" data-cid="${ChEsc(sub2.id)}" title="Rename">✎</button>
                  <button class="btn btn--ghost btn--xs" data-action="del-ch" data-cid="${ChEsc(sub2.id)}" title="Delete">✕</button>
                </span>
              </div>`;
            subs(sub2.id).forEach((sub3) => {
              const isSub3Active = _activeChannelId === sub3.id;
              html += `
                <div class="channel-item channel-item--sub channel-item--sub3${isSub3Active ? ' channel-item--active' : ''}" data-cid="${ChEsc(sub3.id)}">
                  <span class="channel-item__name">${ChEsc(sub3.name)}</span>
                  <span class="channel-item__actions">
                    <button class="btn btn--ghost btn--xs" data-action="rename" data-cid="${ChEsc(sub3.id)}" title="Rename">✎</button>
                    <button class="btn btn--ghost btn--xs" data-action="del-ch" data-cid="${ChEsc(sub3.id)}" title="Delete">✕</button>
                  </span>
                </div>`;
            });
          });
        });
      });
    }
    html += `</div>
        <div class="channel-posts-pane" id="channel-posts-pane">
          <p class="dash-empty" id="ch-select-hint">Select a channel to view posts.</p>
        </div>
      </div>`;
    _main.innerHTML = html;

    // Wire up tree events
    document.getElementById('ch-btn-new').addEventListener('click', () => showChannelModal(null, null));
    _main.querySelectorAll('[data-action="add-sub"]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); showChannelModal(null, b.dataset.cid); }));
    _main.querySelectorAll('[data-action="rename"]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const ch = _channels.find((c) => c.id === b.dataset.cid); showChannelModal(ch, ch.parent_id); }));
    _main.querySelectorAll('[data-action="del-ch"]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); deleteChannel(b.dataset.cid); }));
    _main.querySelectorAll('.channel-item').forEach((el) => el.addEventListener('click', () => openChannel(el.dataset.cid)));

    if (_activeChannelId) openChannel(_activeChannelId);
  }

  async function openChannel(id) {
    _activeChannelId = id;
    _main.querySelectorAll('.channel-item').forEach((el) => el.classList.toggle('channel-item--active', el.dataset.cid === id));
    const pane = document.getElementById('channel-posts-pane');
    if (!pane) return;
    const ch = _channels.find((c) => c.id === id);
    pane.innerHTML = `<p class="loading-text">Loading…</p>`;
    let posts;
    try { posts = await apiGet(`/channel-posts?school_id=${SCHOOL_SLUG}&channel_id=${encodeURIComponent(id)}`); }
    catch (e) { pane.innerHTML = `<p style="color:red">${ChEsc(e.message)}</p>`; return; }

    let html = `
      <div class="channel-posts-head">
        <h2 class="channel-posts-title">${ChEsc(ch?.name ?? '')}</h2>
        <button class="btn btn--primary btn--sm" id="ch-btn-newpost">+ New Post</button>
      </div>`;
    if (!posts.length) {
      html += '<p class="dash-empty">No posts in this channel yet.</p>';
    } else {
      html += '<div class="ch-post-list">';
      posts.forEach((p) => {
        const langs = (p.translations ? Object.entries(p.translations).filter(([, t]) => t.status === 'verified' && !t.stale).map(([l]) => l) : []);
        const hasAf = p.lang === 'af' || langs.includes('af');
        const hasEn = p.lang === 'en' || langs.includes('en');
        html += `
          <div class="ch-post-card" data-pid="${ChEsc(p.id)}">
            <div class="ch-post-card__head">
              <span class="ch-post-card__title">${ChEsc(p.title)}</span>
              <span class="badge badge--${p.status === 'published' ? 'published' : 'draft'}">${ChEsc(p.status)}</span>
            </div>
            <p class="ch-post-card__meta">${ChEsc(p.author_name)} · ${ChFmt(p.updated_at)}${hasEn && hasAf ? ' · EN / AF' : ''}</p>
            <div class="table-actions">
              <button class="btn btn--secondary btn--sm" data-action="edit-post"   data-pid="${ChEsc(p.id)}">Edit</button>
              <button class="btn btn--secondary btn--sm" data-action="trans-post"  data-pid="${ChEsc(p.id)}">Translate</button>
              <button class="btn btn--danger    btn--sm" data-action="del-post"    data-pid="${ChEsc(p.id)}">Delete</button>
            </div>
          </div>`;
      });
      html += '</div>';
    }
    pane.innerHTML = html;
    document.getElementById('ch-btn-newpost').addEventListener('click', () => showPostEditor(null, id, posts));
    pane.querySelectorAll('[data-action="edit-post"]').forEach((b) => b.addEventListener('click', () => {
      const p = posts.find((x) => x.id === b.dataset.pid); if (p) showPostEditor(p, id, posts);
    }));
    pane.querySelectorAll('[data-action="trans-post"]').forEach((b) => b.addEventListener('click', () => {
      const p = posts.find((x) => x.id === b.dataset.pid); if (p) showTranslateModal(p);
    }));
    pane.querySelectorAll('[data-action="del-post"]').forEach((b) => b.addEventListener('click', () => deletePost(b.dataset.pid, id)));
  }

  // ── Channel create/rename modal ───────────────────────────────
  function showChannelModal(ch, parentId) {
    const isEdit = !!ch;
    const parentCh = parentId ? _channels.find((c) => c.id === parentId) : null;
    const title = isEdit ? 'Rename Channel' : (parentCh ? `New Sub-channel of "${parentCh.name}"` : 'New Channel');
    const html = `
      <div class="modal-overlay" id="ch-modal">
        <div class="modal modal--bottom">
          <div class="modal__head"><h2>${ChEsc(title)}</h2><button class="modal__close" id="ch-modal-close">×</button></div>
          <div class="modal__body">
            <div class="form-group">
              <label class="form-label">Channel Name (English) *</label>
              <input id="ch-name-en" class="form-control" value="${ChEsc(ch?.name ?? '')}" placeholder="e.g. Sport"/>
            </div>
            <div class="form-group">
              <label class="form-label">Channel Name (Afrikaans)</label>
              <input id="ch-name-af" class="form-control" value="${ChEsc(ch?.name_af ?? '')}" placeholder="e.g. Sport"/>
            </div>
            <div class="modal__footer">
              <button class="btn btn--ghost" id="ch-modal-cancel">Cancel</button>
              <button class="btn btn--primary" id="ch-modal-save">${isEdit ? 'Rename' : 'Create'}</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const close = () => document.getElementById('ch-modal')?.remove();
    document.getElementById('ch-modal-close').addEventListener('click', close);
    document.getElementById('ch-modal-cancel').addEventListener('click', close);
    document.getElementById('ch-modal').addEventListener('click', (e) => { if (e.target.id === 'ch-modal') close(); });
    document.getElementById('ch-name-en').focus();
    document.getElementById('ch-modal-save').addEventListener('click', async () => {
      const name = document.getElementById('ch-name-en').value.trim();
      const name_af = document.getElementById('ch-name-af').value.trim() || undefined;
      if (!name) { _notify('Channel name is required.', true); return; }
      try {
        if (isEdit) {
          await apiPut(`/channels/${ch.id}`, { name, name_af });
          _notify('Channel renamed.');
        } else {
          await apiPost('/channels', { name, name_af, parent_id: parentId ?? null, school_id: SCHOOL_SLUG });
          _notify('Channel created.');
        }
        close(); renderList();
      } catch (e) { _notify(e.message, true); }
    });
  }

  async function deleteChannel(id) {
    const ch = _channels.find((c) => c.id === id);
    if (!confirm(`Delete channel "${ch?.name}"? All posts inside will also be deleted.`)) return;
    try {
      await apiDelete(`/channels/${id}`);
      _notify('Channel deleted.');
      if (_activeChannelId === id) _activeChannelId = null;
      renderList();
    } catch (e) { _notify(e.message, true); }
  }

  // ── Post editor modal ─────────────────────────────────────────
  function showPostEditor(post, channelId, posts) {
    _editingPost = post;
    const isEdit = !!post;
    const eventOptions = _events.map((ev) => `<option value="${ChEsc(ev.id)}" ${post?.event_id === ev.id ? 'selected' : ''}>${ChEsc(ev.title)} (${ChEsc(ev.start_date)})</option>`).join('');

    const html = `
      <div class="modal-overlay" id="ch-post-modal">
        <div class="modal modal--fullscreen">
          <div class="modal__head">
            <h2>${isEdit ? 'Edit Post' : 'New Post'}</h2>
            <div style="display:flex;gap:.5rem;align-items:center;margin-left:auto">
              <button class="btn btn--secondary btn--sm" id="ch-post-draft">${isEdit && post.status === 'published' ? 'Unpublish' : 'Save Draft'}</button>
              <button class="btn btn--primary btn--sm" id="ch-post-publish">${isEdit && post.status === 'published' ? 'Update' : 'Publish'}</button>
            </div>
            <button class="modal__close" id="ch-post-close" title="Close">×</button>
          </div>
          <div class="modal__body">
            <div class="form-group">
              <label class="form-label">Title *</label>
              <input id="ch-f-title" class="form-control" value="${ChEsc(post?.title ?? '')}" placeholder="Post title"/>
            </div>
            <div class="form-group">
              <label class="form-label">Content</label>
              <div id="ch-quill-wrap" style="min-height:180px;border:1px solid var(--border);border-radius:var(--radius)"></div>
            </div>
            <div class="form-group">
              <label class="form-label">Link to Calendar Event (optional)</label>
              <select id="ch-f-event" class="form-control">
                <option value="">— None —</option>
                ${eventOptions}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Language this post is written in</label>
              <select id="ch-f-lang" class="form-control">
                <option value="en" ${(!post || post.lang === 'en') ? 'selected' : ''}>English</option>
                <option value="af" ${post?.lang === 'af' ? 'selected' : ''}>Afrikaans</option>
              </select>
            </div>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    // Load Quill
    const loadQ = (cb) => { if (window.Quill) { cb(); return; } const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdn.quilljs.com/1.3.7/quill.snow.css'; document.head.appendChild(l); const s = document.createElement('script'); s.src = 'https://cdn.quilljs.com/1.3.7/quill.min.js'; s.onload = cb; document.head.appendChild(s); };
    loadQ(() => {
      _quillInst = new window.Quill('#ch-quill-wrap', { theme: 'snow', placeholder: 'Write channel post content here…' });
      if (post?.content_html) _quillInst.root.innerHTML = post.content_html;
    });

    const close = () => { document.getElementById('ch-post-modal')?.remove(); _quillInst = null; };
    document.getElementById('ch-post-close').addEventListener('click', close);
    document.getElementById('ch-post-modal').addEventListener('click', (e) => { if (e.target.id === 'ch-post-modal') close(); });

    const save = async (status) => {
      const title = document.getElementById('ch-f-title').value.trim();
      if (!title) { _notify('Title is required.', true); return; }
      const content_html = _quillInst ? _quillInst.root.innerHTML : (post?.content_html ?? '');
      const event_id = document.getElementById('ch-f-event').value || null;
      const lang = document.getElementById('ch-f-lang').value;
      try {
        if (isEdit) {
          await apiPut(`/channel-posts/${post.id}`, { title, content_html, event_id, lang, status });
          _notify(status === 'published' ? 'Post published!' : 'Draft saved.');
        } else {
          await apiPost('/channel-posts', { channel_id: channelId, title, content_html, event_id, lang, status, school_id: SCHOOL_SLUG });
          _notify(status === 'published' ? 'Post published!' : 'Draft saved.');
        }
        close(); openChannel(channelId);
      } catch (e) { _notify(e.message, true); }
    };
    document.getElementById('ch-post-draft').addEventListener('click', () => save('draft'));
    document.getElementById('ch-post-publish').addEventListener('click', () => save('published'));
  }

  // ── Translation modal ─────────────────────────────────────────
  function showTranslateModal(post) {
    const targetLang = post.lang === 'en' ? 'af' : 'en';
    const targetLabel = targetLang === 'af' ? 'Afrikaans' : 'English';
    const existing = post.translations?.[targetLang];
    const html = `
      <div class="modal-overlay" id="ch-trans-modal">
        <div class="modal modal--fullscreen">
          <div class="modal__head">
            <h2>Translate: ${ChEsc(post.title)}</h2>
            <div style="display:flex;gap:.5rem;align-items:center">
              <button class="btn btn--secondary btn--sm" id="ch-trans-save">Save Draft</button>
              <button class="btn btn--primary btn--sm" id="ch-trans-verify">✓ Save & Verify</button>
              <button class="modal__close" id="ch-trans-close">×</button>
            </div>
          </div>
          <div class="modal__body">
            <p style="color:var(--text-light);font-size:.9375rem;margin-bottom:.75rem">Write the <strong>${ChEsc(targetLabel)}</strong> version below.</p>
            <div class="form-group">
              <label class="form-label">Title (${ChEsc(targetLabel)}) *</label>
              <input id="ch-trans-title" class="form-control" value="${ChEsc(existing?.title ?? '')}" placeholder="Translated title"/>
            </div>
            <div class="form-group">
              <label class="form-label">Content (${ChEsc(targetLabel)})</label>
              <div id="ch-trans-quill" style="min-height:160px;border:1px solid var(--border);border-radius:var(--radius)"></div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const loadQ = (cb) => { if (window.Quill) { cb(); return; } const s = document.createElement('script'); s.src = 'https://cdn.quilljs.com/1.3.7/quill.min.js'; s.onload = cb; document.head.appendChild(s); };
    let transQuill;
    loadQ(() => {
      transQuill = new window.Quill('#ch-trans-quill', { theme: 'snow', placeholder: 'Write translation here…' });
      if (existing?.content_html) transQuill.root.innerHTML = existing.content_html;
    });
    const close = () => document.getElementById('ch-trans-modal')?.remove();
    document.getElementById('ch-trans-close').addEventListener('click', close);
    document.getElementById('ch-trans-modal').addEventListener('click', (e) => { if (e.target.id === 'ch-trans-modal') close(); });

    const saveTranslation = async (verify) => {
      const title = document.getElementById('ch-trans-title').value.trim();
      if (!title) { _notify('Title is required.', true); return; }
      const content_html = transQuill ? transQuill.root.innerHTML : '';
      try {
        await apiPut(`/channel-posts/${post.id}/translate`, { lang: targetLang, title, content_html });
        if (verify) await apiPut(`/channel-posts/${post.id}/verify-translation`, { lang: targetLang });
        _notify(verify ? 'Translation verified.' : 'Translation saved as draft.');
        close(); openChannel(post.channel_id);
      } catch (e) { _notify(e.message, true); }
    };
    document.getElementById('ch-trans-save').addEventListener('click', () => saveTranslation(false));
    document.getElementById('ch-trans-verify').addEventListener('click', () => saveTranslation(true));
  }

  async function deletePost(id, channelId) {
    if (!confirm('Delete this post?')) return;
    try { await apiDelete(`/channel-posts/${id}`); _notify('Post deleted.'); openChannel(channelId); }
    catch (e) { _notify(e.message, true); }
  }

  return { mount };
})();

// ── Student Channels UI ───────────────────────────────────────────────────────
const ChannelsStudent = (() => {
  let _session;
  let _channels = [], _events = [];

  async function mount(container, session) {
    _session = session;
    container.innerHTML = `<p class="loading-text">${t('loading')}</p>`;
    try {
      [_channels, _events] = await Promise.all([
        apiGet(`/channels?school_id=${SCHOOL_SLUG}`),
        apiGet(`/calendar-events?school_id=${SCHOOL_SLUG}`).catch(() => []),
      ]);
    } catch (e) { container.innerHTML = `<p class="loading-text" style="color:red">${ChEsc(e.message)}</p>`; return; }
    renderTree(container);
  }

  function renderTree(container) {
    const topLevel = _channels.filter((c) => !c.parent_id);
    if (!topLevel.length) { container.innerHTML = `<p class="dash-empty" data-i18n="noChannels">${t('noChannels')}</p>`; return; }
    const lang = currentLang();
    let html = '<div class="channel-tree channel-tree--student">';
    topLevel.forEach((ch) => {
      const name = (lang === 'af' && ch.name_af) ? ch.name_af : ch.name;
      const subs = _channels.filter((c) => c.parent_id === ch.id);
      html += `<details class="channel-section">
        <summary class="channel-section__head">${ChEsc(name)}</summary>
        <div class="channel-section__body">`;
      if (subs.length) {
        subs.forEach((sub) => {
          const subName = (lang === 'af' && sub.name_af) ? sub.name_af : sub.name;
          const sub2s = _channels.filter((c) => c.parent_id === sub.id);
          if (sub2s.length) {
            html += `<details class="channel-section channel-section--nested">
              <summary class="channel-sub-btn channel-sub-btn--parent">${ChEsc(subName)}</summary>`;
            sub2s.forEach((s2) => {
              const s2Name = (lang === 'af' && s2.name_af) ? s2.name_af : s2.name;
              const sub3s = _channels.filter((c) => c.parent_id === s2.id);
              if (sub3s.length) {
                html += `<details class="channel-section channel-section--nested2">
                  <summary class="channel-sub-btn channel-sub-btn--nested">${ChEsc(s2Name)}</summary>`;
                sub3s.forEach((s3) => {
                  const s3Name = (lang === 'af' && s3.name_af) ? s3.name_af : s3.name;
                  html += `<button class="channel-sub-btn channel-sub-btn--nested2" data-cid="${ChEsc(s3.id)}">${ChEsc(s3Name)}</button>`;
                });
                html += '</details>';
              } else {
                html += `<button class="channel-sub-btn channel-sub-btn--nested" data-cid="${ChEsc(s2.id)}">${ChEsc(s2Name)}</button>`;
              }
            });
            html += '</details>';
          } else {
            html += `<button class="channel-sub-btn" data-cid="${ChEsc(sub.id)}">${ChEsc(subName)}</button>`;
          }
        });
      } else {
        html += `<button class="channel-sub-btn" data-cid="${ChEsc(ch.id)}">${ChEsc(name)}</button>`;
      }
      html += '</div></details>';
    });
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('[data-cid]').forEach((btn) => btn.addEventListener('click', () => openChannelPosts(container, btn.dataset.cid)));
  }

  async function openChannelPosts(container, channelId) {
    const ch = _channels.find((c) => c.id === channelId);
    const lang = currentLang();
    const chName = (lang === 'af' && ch?.name_af) ? ch.name_af : (ch?.name ?? '');
    container.innerHTML = `<p class="loading-text">${t('loading')}</p>`;
    let posts;
    try { posts = await apiGet(`/channel-posts?school_id=${SCHOOL_SLUG}&channel_id=${encodeURIComponent(channelId)}&lang=${lang}`); }
    catch (e) { container.innerHTML = `<p class="loading-text" style="color:red">${ChEsc(e.message)}</p>`; return; }

    let html = `
      <div class="page-toolbar">
        <button class="btn btn--ghost btn--sm" id="ch-student-back">← ${t('back')}</button>
        <h2 class="page-title">${ChEsc(chName)}</h2>
      </div>`;
    if (!posts.length) {
      html += `<p class="dash-empty">${t('noPosts')}</p>`;
    } else {
      html += '<div class="ch-post-list ch-post-list--student">';
      posts.forEach((p) => {
        html += `<article class="ch-post-card ch-post-card--student" data-pid="${ChEsc(p.id)}" role="button" tabindex="0">
          <h3 class="ch-post-card__title">${ChEsc(p.title)}</h3>
          <p class="ch-post-card__meta">${ChFmt(p.updated_at)}</p>
        </article>`;
      });
      html += '</div>';
    }
    container.innerHTML = html;
    document.getElementById('ch-student-back').addEventListener('click', () => renderTree(container));
    container.querySelectorAll('.ch-post-card--student').forEach((card) => {
      const open = () => openPost(container, card.dataset.pid, posts, channelId);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(); });
    });
  }

  async function openPost(container, postId, posts, channelId) {
    const lang = currentLang();
    container.innerHTML = `<p class="loading-text">${t('loading')}</p>`;
    let post;
    try { post = await apiGet(`/channel-posts/${postId}?lang=${lang}`); }
    catch { post = posts.find((p) => p.id === postId); }
    if (!post) { container.innerHTML = `<p class="loading-text" style="color:red">Post not found.</p>`; return; }

    const ev = post.event_id ? _events.find((e) => e.id === post.event_id) : null;
    const evName = ev ? ((lang === 'af' && ev.title_af) ? ev.title_af : ev.title) : null;
    const evDesc = ev ? ((lang === 'af' && ev.description_af) ? ev.description_af : ev.description) : null;
    const eventCard = ev ? `
      <div class="ch-event-card">
        <div class="ch-event-card__head">📅 ${ChEsc(evName)}</div>
        <div class="ch-event-card__dates">${ChEsc(formatDateRange(ev.start_date, ev.end_date))}</div>
        ${ev.location ? `<div class="ch-event-card__loc">📍 ${ChEsc(ev.location)}</div>` : ''}
        ${evDesc ? `<div class="ch-event-card__desc">${ChEsc(evDesc)}</div>` : ''}
      </div>` : '';

    container.innerHTML = `
      <div class="page-toolbar">
        <button class="btn btn--ghost btn--sm" id="ch-post-back">← ${t('back')}</button>
      </div>
      <article class="post-view ch-post-view">
        <h1 class="post-view__title">${ChEsc(post.title)}</h1>
        <p class="post-view__meta">${ChFmt(post.updated_at)}</p>
        ${eventCard}
        <div class="post-content">${safeHtml(post.content_html ?? '')}</div>
      </article>`;
    document.getElementById('ch-post-back').addEventListener('click', () => openChannelPosts(container, channelId));
  }

  function formatDateRange(start, end) {
    if (!end || end === start) return ChFmt(start);
    return `${ChFmt(start)} – ${ChFmt(end)}`;
  }

  return { mount };
})();
