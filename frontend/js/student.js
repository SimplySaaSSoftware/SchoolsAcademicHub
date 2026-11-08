/* student.js — student portal */
(async () => {
  const session = requireSession(['student']);
  if (!session) return;

  const main   = document.querySelector('main');
  const notify = document.getElementById('notification');

  // Branding — apply cached color immediately to avoid flash on navigation
  const _brandKey = `brand_color_${SCHOOL_SLUG}`;
  const _cachedColor = sessionStorage.getItem(_brandKey);
  if (_cachedColor) document.documentElement.style.setProperty('--primary', _cachedColor);

  try {
    const school = await apiGet(`/school/config/${SCHOOL_SLUG}`);
    const _color = school.primary_colour ?? '#1a56a0';
    document.title = `${school.name} — Student`;
    document.documentElement.style.setProperty('--primary', _color);
    document.getElementById('school-brand').textContent = school.name;
    sessionStorage.setItem(_brandKey, _color);
  } catch {}

  // Greet individual students by name (shared grade PINs have no personal name)

  mountLangToggle(document.getElementById('lang-toggle-wrap'));
  const badge = document.getElementById('grade-badge');
  function renderHeaderGrade() {
    if (badge && session.grade) badge.textContent = `${t('grade')} ${session.grade}`;
    // phones: the grade shares the name row (the badge is hidden there)
    const el = document.getElementById('student-name');
    if (!el || !session.grade) return;
    const label = `${t('grade')} ${session.grade}`;
    el.innerHTML = session.individual && session.name ? `${esc(session.name)} <span class="site-header__grade">· ${esc(label)}</span>` : `<span class="site-header__grade">${esc(label)}</span>`;
    el.classList.toggle('site-header__user--grade-only', !(session.individual && session.name));
    el.hidden = false;
  }
  document.getElementById('btn-logout').addEventListener('click', logout);
  renderHeaderGrade();
  applyI18n();

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

  // ── Post list ───────────────────────────────────────────────
  let allPosts = [];
  let view = { name: 'list' };   // what is on screen, so a language change can redraw it

  async function loadPosts() {
    main.innerHTML = `<p class="loading-text">${t('loadingPosts')}</p>`;
    try {
      allPosts = await apiGet(`/posts?school_id=${SCHOOL_SLUG}`);
    } catch (e) {
      main.innerHTML = `<p class="loading-text" style="color:red">${e.message}</p>`;
      return;
    }
    renderPostList();
  }

  // To do / Done / All. Default is "To do" so children see what is left first.
  let filter = (() => { try { return sessionStorage.getItem('hub_filter') || 'todo'; } catch { return 'todo'; } })();
  const setFilter = (f) => { filter = f; try { sessionStorage.setItem('hub_filter', f); } catch {} renderPostList(); };

  // 'todo' | 'retry' | 'done' for individual students; null for shared grade PINs (no personal progress)
  // A quiz is done when passed (80%+); a post without a quiz is done once opened.
  function postStatus(p) {
    const pr = p.progress;
    if (!pr) return null;
    if (p.has_quiz) return pr.passed ? 'done' : (pr.attempts > 0 ? 'retry' : 'todo');
    return pr.opened ? 'done' : 'todo';
  }

  function renderPostList() {
    view = { name: 'list' };
    if (!allPosts.length) {
      main.innerHTML = `<p class="loading-text">${t('noPosts')}</p>`;
      return;
    }

    const tracked = allPosts.every((p) => p.progress);
    const status = (p) => postStatus(p);
    const doneCount = tracked ? allPosts.filter((p) => status(p) === 'done').length : 0;
    const todoCount = allPosts.length - doneCount;
    const f = tracked ? filter : 'all';
    const shown = allPosts.filter((p) => f === 'all' || (f === 'done' ? status(p) === 'done' : status(p) !== 'done'));

    let html = '<div class="posts-grid">';
    if (tracked) {
      const pct = Math.round((doneCount / allPosts.length) * 100);
      html += `<div class="dash-summary">
          <div class="dash-summary__line"><strong>${t('progressLine', { done: doneCount, total: allPosts.length })}</strong><span>${pct}%</span></div>
          <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
        </div>
        <div class="dash-tabs" role="group">
          ${[['todo', t('tabTodo'), todoCount], ['done', t('tabDone'), doneCount], ['all', t('tabAll'), allPosts.length]].map(([k, label, n]) =>
            `<button type="button" class="dash-tab ${f === k ? 'dash-tab--on' : ''}" data-filter="${k}" aria-pressed="${f === k}">${label} <span class="dash-tab__n">${n}</span></button>`).join('')}
        </div>`;
    }

    if (!shown.length) {
      html += f === 'todo'
        ? `<div class="dash-empty-state"><h2>${t('allDoneTitle')}</h2><p>${t('allDoneText')}</p><button type="button" class="btn btn--primary" data-filter="all">${t('showAll')}</button></div>`
        : `<p class="dash-empty">${t('nothingDone')}</p>`;
    }

    // Group by subject
    const bySubject = {};
    shown.forEach((p) => { (bySubject[p.subject] = bySubject[p.subject] || []).push(p); });
    Object.entries(bySubject).forEach(([subject, posts]) => {
      html += `<details class="subject-section" open>
        <summary class="subject-heading"><span>${esc(subjectName(posts[0]))}</span><span class="subject-count">${posts.length}</span></summary>
        <div class="cards">`;
      posts.forEach((p) => {
        const st = status(p);
        const pr = p.progress;
        const stLabel = { todo: t('statusTodo'), retry: t('statusRetry'), done: t('statusDone') }[st];
        const score = p.has_quiz && pr
          ? (pr.attempts > 0
              ? `<span class="score-chip score-chip--${pr.passed ? 'pass' : 'fail'}">${t('best')} ${pr.best}%</span><span class="post-card__tries">${pr.attempts} ${pr.attempts === 1 ? t('attemptOne') : t('attemptMany')}</span>`
              : `<span class="post-card__tries">${t('notTaken')}</span>`)
          : '';
        html += `<article class="post-card ${st ? 'post-card--' + st : ''}" data-id="${esc(p.id)}" role="button" tabindex="0">
          <div class="post-card__header">
            <h3 class="post-card__title">${esc(primaryTitle(p))}</h3>
            ${p.has_quiz ? `<span class="badge badge--quiz">${t('quiz')}</span>` : ''}
          </div>
          ${secondaryTitle(p) ? `<p class="post-card__alt" lang="${p.lang === 'af' ? 'en' : 'af'}">${esc(secondaryTitle(p))}</p>` : ''}
          <p class="post-card__meta">${t('term')} ${esc(p.term)} &bull; ${t('grade')} ${esc(String(p.grade))}${(p.available_langs ?? []).length > 1 ? ' &bull; EN / AF' : ''}</p>
          ${st ? `<div class="post-card__status"><span class="status-chip status-chip--${st}">${stLabel}</span>${score}</div>` : ''}
        </article>`;
      });
      html += '</div></details>';
    });
    html += '</div>';
    main.innerHTML = html;

    main.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.filter)));
    main.querySelectorAll('.post-card').forEach((card) => {
      const open = () => openPost(card.dataset.id);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(); });
    });
  }

  // Keep the dashboard in step with what the student just did, without a reload
  function bumpProgress(id, patch) {
    const p = allPosts.find((x) => x.id === id);
    if (!p || !p.progress) return;
    Object.assign(p.progress, patch);
  }

  // ── Language preference (English / Afrikaans) ───────────────
  const LANG_LABEL = { en: 'English', af: 'Afrikaans' };
  const prefLang = () => currentLang();       // one choice drives the interface and the post language
  const setPrefLang = (l) => setUiLang(l);

  // Subject name in the chosen language (set up per subject by the admin); falls back to the stored name
  const subjectName = (p) => (p.subject_names && p.subject_names[currentLang()]) || p.subject;

  // Title shown big: preferred language when the post has it, else the original
  const primaryTitle   = (p) => (prefLang() && p.titles?.[prefLang()]) || p.title;
  // Title shown small underneath: the other language, when the post has one
  const secondaryTitle = (p) => {
    const main = primaryTitle(p);
    return Object.values(p.titles ?? {}).find((t) => t && t !== main) ?? '';
  };

  // ── Post view ───────────────────────────────────────────────
  async function openPost(id, track = true) {
    view = { name: 'post', id };
    main.innerHTML = `<p class="loading-text">${t('loading')}</p>`;
    let post;
    try {
      const pl = prefLang();
      post = await apiGet(`/posts/${id}${pl ? `?lang=${pl}` : ''}`);
    } catch (e) {
      main.innerHTML = `<p class="loading-text" style="color:red">${e.message}</p>`;
      return;
    }

    bumpProgress(id, { opened: true });

    // Track activity (fire and forget)
    if (track) apiPost('/activity/post-opened', {
      post_id: post.id, post_title: post.title, subject: post.subject, term: post.term,
    }).catch(() => {});

    const questions   = (() => { try { return JSON.parse(post.quiz_json || '[]'); } catch { return []; } })();
    const attachments = (() => { try { return JSON.parse(post.attachments_json || '[]'); } catch { return []; } })();
    const attachHtml  = attachments.length ? `
      <div class="attachments" style="margin:1rem 0">
        <h4 style="margin:0 0 .5rem">${t('attachments')}</h4>
        ${attachments.map((a) => {
          const name        = typeof a === 'string' ? a : a.name;
          const rawId       = typeof a === 'string' ? a : a.driveId;
          const isDriveId   = rawId && !rawId.startsWith('http');
          const previewUrl  = isDriveId ? `/api/files/${encodeURIComponent(rawId)}?t=${encodeURIComponent(getToken() ?? '')}` : rawId;
          const downloadUrl = isDriveId ? `https://drive.google.com/uc?id=${encodeURIComponent(rawId)}&export=download` : rawId;
          return `<div class="attachment-item">
            <details class="attachment-expander">
              <summary>📎 ${esc(name)}<span style="font-size:.75rem;font-weight:400;opacity:.7;margin-left:.5rem">${t('tapToView')}</span></summary>
              <iframe src="${esc(previewUrl)}" class="attachment-frame" allowfullscreen loading="lazy"></iframe>
            </details>
            <a href="${esc(downloadUrl)}" target="_blank" rel="noopener" class="attachment-dl" title="Download">⬇</a>
          </div>`;
        }).join('')}
      </div>` : '';

    main.innerHTML = `
      <div class="post-view">
        <button id="btn-back" class="btn btn--secondary btn--sm" style="margin-bottom:1rem;">${t('back')}</button>
        ${(post.available_langs ?? []).length > 1 ? `
          <div class="lang-switch" role="group" aria-label="${t('language')}">
            ${post.available_langs.map((l) => `<button class="lang-switch__btn ${l === post.lang ? 'lang-switch__btn--on' : ''}" data-lang="${l}" ${l === post.lang ? 'aria-pressed="true"' : 'aria-pressed="false"'}>${LANG_LABEL[l]}</button>`).join('')}
          </div>` : ''}
        <h1 class="post-view__title">${esc(post.title)}</h1>
        <p class="post-view__meta">${t('grade')} ${esc(String(post.grade))} &bull; ${esc(subjectName(post))} &bull; ${t('term')} ${esc(post.term)}</p>
        <div class="post-content" id="post-content">${sanitize(post.content_html ?? '')}</div>
        ${attachHtml}
        ${questions.length ? '<div id="quiz-section"></div>' : ''}
      </div>`;

    document.getElementById('btn-back').addEventListener('click', renderPostList);
    main.querySelectorAll('.lang-switch__btn').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.lang === post.lang) return;
      setPrefLang(b.dataset.lang);
    }));

    if (questions.length) {
      renderQuiz(questions, post);
    }
  }

  // ── KaTeX math rendering ──────────────────────────────────────
  function loadKatex(cb) {
    if (window.katex) { cb(); return; }
    if (!document.querySelector('link[href*="katex"]')) {
      const lnk = document.createElement('link');
      lnk.rel  = 'stylesheet';
      lnk.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
      document.head.appendChild(lnk);
    }
    const s = document.createElement('script');
    s.src    = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  function renderMathText(text) {
    if (!text) return '';
    if (/<[a-z][\s\S]*>/i.test(text)) return sanitize(text);
    if (!window.katex || !text.includes('$')) return esc(text);
    let html = '', i = 0;
    while (i < text.length) {
      if (text[i] === '$') {
        const display = text[i + 1] === '$';
        const delim   = display ? '$$' : '$';
        const start   = i + delim.length;
        const end     = text.indexOf(delim, start);
        if (end === -1) { html += esc(text[i]); i++; continue; }
        try { html += window.katex.renderToString(text.slice(start, end), { displayMode: display, throwOnError: false }); }
        catch { html += esc(delim + text.slice(start, end) + delim); }
        i = end + delim.length;
      } else {
        const next  = text.indexOf('$', i);
        const chunk = next === -1 ? text.slice(i) : text.slice(i, next);
        html += esc(chunk);
        i = next === -1 ? text.length : next;
      }
    }
    return html;
  }

  // ── Quiz renderer ───────────────────────────────────────────
  function renderQuiz(questions, post) {
    // Restore content visibility when returning to start screen
    if (post.quiz_hide_content) {
      const content = document.getElementById('post-content');
      const attachSection = content?.nextElementSibling;
      if (content) content.hidden = false;
      if (attachSection && attachSection.classList.contains('attachments')) attachSection.hidden = false;
    }

    const section = document.getElementById('quiz-section');

    // Show teaser with Start button — questions hidden until student is ready
    section.innerHTML = `
      <div class="quiz-card">
        <h2 class="quiz-title">${t('quiz')}</h2>
        <p style="color:var(--text-light);margin-bottom:1rem">${questions.length} ${questions.length !== 1 ? t('questionMany') : t('questionOne')}</p>
        <button id="btn-start-quiz" class="btn btn--primary" style="width:100%;padding:.75rem">${t('startQuiz')}</button>
      </div>`;

    document.getElementById('btn-start-quiz').addEventListener('click', () => {
      loadKatex(() => startQuiz(questions, post));
    });
  }

  function startQuiz(questions, post) {
    // Hide post content and attachments if teacher enabled the option
    if (post.quiz_hide_content) {
      const content = document.getElementById('post-content');
      const attachSection = content?.nextElementSibling;
      if (content) content.hidden = true;
      if (attachSection && attachSection.classList.contains('attachments')) attachSection.hidden = true;
    }

    const section = document.getElementById('quiz-section');
    let html = `<div class="quiz-card"><h2 class="quiz-title">${t('quiz')}</h2>`;
    questions.forEach((q, i) => {
      const questionHtml = renderMathText(q.question);
      const tipHtml = q.tip ? `<div class="quiz-tip">💡 ${renderMathText(q.tip)}</div>` : '';
      html += `<div class="quiz-question" data-index="${i}">
        <div class="quiz-question__text"><strong>Q${i + 1}.</strong> ${questionHtml}</div>
        ${tipHtml}
        <div class="quiz-options">`;
      (q.options || []).forEach((opt, oi) => {
        html += `<label class="quiz-option">
          <input type="radio" name="q${i}" value="${oi}"/>
          <span>${renderMathText(opt)}</span>
        </label>`;
      });
      html += '</div></div>';
    });
    html += `<div id="quiz-result" hidden></div>
      <button id="btn-submit-quiz" class="btn btn--primary" style="margin-top:1rem;width:100%">${t('submitQuiz')}</button>
    </div>`;
    section.innerHTML = html;

    const startTime = Date.now();
    document.getElementById('btn-submit-quiz').addEventListener('click', async () => {
      const selections = [];
      let allAnswered = true;
      questions.forEach((q, i) => {
        const sel = section.querySelector(`input[name="q${i}"]:checked`);
        if (!sel) { allAnswered = false; return; }
        selections.push(Number(sel.value));
      });
      if (!allAnswered) { showNotify(t('answerAll'), true); return; }

      const btn     = document.getElementById('btn-submit-quiz');
      btn.disabled  = true; btn.textContent = t('submitting');

      try {
        // Server grades the quiz; we only send which option was picked
        const result = await apiPost('/activity/quiz-attempt', {
          post_id: post.id, lang: post.lang, selections,
          time_taken_seconds: Math.round((Date.now() - startTime) / 1000),
        });
        const score = result.score;
        const prev = allPosts.find((x) => x.id === post.id)?.progress;
        bumpProgress(post.id, {
          opened: true, attempts: (prev?.attempts ?? 0) + 1, last: result.percentage,
          best: Math.max(prev?.best ?? 0, result.percentage), passed: (prev?.passed ?? false) || result.passed,
        });

        section.querySelectorAll('.quiz-question').forEach((el, i) => {
          const r = result.results[i];
          el.classList.add(r.is_right ? 'quiz-question--correct' : 'quiz-question--wrong');
          el.querySelectorAll('input').forEach((inp) => inp.disabled = true);
          if (!r.is_right) {
            const hint = document.createElement('p');
            hint.className = 'quiz-hint';
            hint.innerHTML = `${t('correctAnswer')} ${renderMathText(questions[i].options[r.correct_index])}`;
            el.appendChild(hint);
          }
          if (questions[i].explanation) {
            const expl = document.createElement('p');
            expl.className = 'quiz-explanation';
            expl.innerHTML = `📝 ${renderMathText(questions[i].explanation)}`;
            el.appendChild(expl);
          }
        });

        const resultEl = document.getElementById('quiz-result');
        const pct      = result.percentage;
        resultEl.className = `quiz-result ${pct >= 80 ? 'quiz-result--pass' : 'quiz-result--fail'}`;
        resultEl.innerHTML = `<strong>${pct >= 80 ? t('wellDone') : t('keepPracticing')}</strong>
          ${t('youScored')} ${score}/${questions.length} (${pct}%)${result.attempt_number > 1 ? ` — ${t('attempt')} ${result.attempt_number}` : ''}.`;
        resultEl.hidden = false;
        btn.textContent = t('retake');
        btn.disabled    = false;
        btn.addEventListener('click', () => renderQuiz(questions, post), { once: true });
      } catch (err) {
        showNotify(tErr(err.message), true);
        btn.disabled = false; btn.textContent = t('submitQuiz');
      }
    });
  }

  function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  const sanitize = safeHtml;   // js/safe-html.js

  // ── Main tab navigation ──────────────────────────────────────
  let mainTab = 'lessons';   // 'lessons' | 'channels' | 'calendar'
  const channelsContainer = document.createElement('div');
  channelsContainer.id = 'channels-pane';
  channelsContainer.style.flex = '1';
  const calendarContainer = document.createElement('div');
  calendarContainer.id = 'calendar-pane';
  calendarContainer.style.flex = '1';

  function renderTabBar() {
    let bar = document.getElementById('student-tab-bar');
    if (!bar) {
      bar = document.createElement('nav');
      bar.id = 'student-tab-bar';
      bar.className = 'student-tabs';
      bar.setAttribute('role', 'tablist');
      main.parentNode.insertBefore(bar, main);
    }
    bar.innerHTML = `
      <button class="student-tab ${mainTab === 'lessons'  ? 'student-tab--on' : ''}" data-tab="lessons"  role="tab" aria-selected="${mainTab === 'lessons'}"  data-i18n="tabLessons">${t('tabLessons')}</button>
      <button class="student-tab ${mainTab === 'channels' ? 'student-tab--on' : ''}" data-tab="channels" role="tab" aria-selected="${mainTab === 'channels'}" data-i18n="tabChannels">${t('tabChannels')}</button>
      <button class="student-tab ${mainTab === 'calendar' ? 'student-tab--on' : ''}" data-tab="calendar" role="tab" aria-selected="${mainTab === 'calendar'}" data-i18n="tabCalendar">${t('tabCalendar')}</button>`;
    bar.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  }

  let _channelsMounted = false;
  let _calendarMounted = false;

  function switchTab(tab) {
    mainTab = tab;
    renderTabBar();
    main.style.display        = tab === 'lessons'  ? '' : 'none';
    channelsContainer.style.display = tab === 'channels' ? '' : 'none';
    calendarContainer.style.display = tab === 'calendar' ? '' : 'none';
    if (tab === 'channels' && !_channelsMounted) {
      _channelsMounted = true;
      ChannelsStudent.mount(channelsContainer, session);
    }
    if (tab === 'calendar' && !_calendarMounted) {
      _calendarMounted = true;
      CalendarStudent.mount(calendarContainer, session);
    }
  }

  // Insert panes after main
  main.parentNode.insertBefore(channelsContainer, main.nextSibling);
  channelsContainer.after(calendarContainer);
  channelsContainer.style.display = 'none';
  calendarContainer.style.display = 'none';

  renderTabBar();

  // English <-> Afrikaans: redraw whatever is on screen (a quiz in progress restarts)
  document.addEventListener('uilangchange', () => {
    renderHeaderGrade();
    renderTabBar();
    applyI18n();
    if (mainTab === 'channels') { _channelsMounted = false; ChannelsStudent.mount(channelsContainer, session); _channelsMounted = true; }
    if (mainTab === 'calendar') { _calendarMounted = false; CalendarStudent.mount(calendarContainer, session); _calendarMounted = true; }
    if (mainTab === 'lessons') { if (view.name === 'post') openPost(view.id, false); else renderPostList(); }
  });

  await loadPosts();
})();
