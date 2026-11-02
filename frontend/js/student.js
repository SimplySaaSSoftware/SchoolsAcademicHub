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

  function showNotify(msg, isError = false) {
    notify.textContent = msg;
    notify.className   = `notification${isError ? ' notification--error' : ''}`;
    notify.hidden      = false;
    setTimeout(() => { notify.hidden = true; }, 3500);
  }

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

  function renderPostList() {
    view = { name: 'list' };
    if (!allPosts.length) {
      main.innerHTML = `<p class="loading-text">${t('noPosts')}</p>`;
      return;
    }

    // Group by subject
    const bySubject = {};
    allPosts.forEach((p) => {
      (bySubject[p.subject] = bySubject[p.subject] || []).push(p);
    });

    const bilingual = allPosts.some((p) => (p.available_langs ?? []).length > 1);
    let html = '<div class="posts-grid">';
    if (bilingual) {
      const cur = currentLang();
      html += `<div class="lang-switch" role="group" aria-label="${t('language')}">
        ${['en', 'af'].map((l) => `<button class="lang-switch__btn ${cur === l ? 'lang-switch__btn--on' : ''}" data-lang="${l}" aria-pressed="${cur === l}">${LANG_LABEL[l]}</button>`).join('')}
      </div>`;
    }
    Object.entries(bySubject).forEach(([subject, posts]) => {
      html += `<section class="subject-section">
        <h2 class="subject-heading">${esc(subject)}</h2>
        <div class="cards">`;
      posts.forEach((p) => {
        const hasQuiz = !!p.has_quiz;
        html += `<article class="post-card" data-id="${esc(p.id)}" role="button" tabindex="0">
          <div class="post-card__header">
            <h3 class="post-card__title">${esc(primaryTitle(p))}</h3>
            ${hasQuiz ? `<span class="badge badge--quiz">${t('quiz')}</span>` : ''}
          </div>
          ${secondaryTitle(p) ? `<p class="post-card__alt" lang="${p.lang === 'af' ? 'en' : 'af'}">${esc(secondaryTitle(p))}</p>` : ''}
          <p class="post-card__meta">${t('term')} ${esc(p.term)} &bull; ${t('grade')} ${esc(String(p.grade))}${(p.available_langs ?? []).length > 1 ? ' &bull; EN / AF' : ''}</p>
        </article>`;
      });
      html += '</div></section>';
    });
    html += '</div>';
    main.innerHTML = html;

    main.querySelectorAll('.posts-grid > .lang-switch .lang-switch__btn').forEach((b) => b.addEventListener('click', () => setPrefLang(b.dataset.lang)));

    main.querySelectorAll('.post-card').forEach((card) => {
      const open = () => openPost(card.dataset.id);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(); });
    });
  }

  // ── Language preference (English / Afrikaans) ───────────────
  const LANG_LABEL = { en: 'English', af: 'Afrikaans' };
  const prefLang = () => currentLang();       // one choice drives the interface and the post language
  const setPrefLang = (l) => setUiLang(l);

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
        <p class="post-view__meta">${t('grade')} ${esc(String(post.grade))} &bull; ${esc(post.subject)} &bull; ${t('term')} ${esc(post.term)}</p>
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

    document.getElementById('btn-start-quiz').addEventListener('click', () => startQuiz(questions, post));
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
      const questionHtml = q.question.includes('<') ? sanitize(q.question) : esc(q.question);
      html += `<div class="quiz-question" data-index="${i}">
        <div class="quiz-question__text"><strong>Q${i + 1}.</strong> ${questionHtml}</div>
        <div class="quiz-options">`;
      (q.options || []).forEach((opt, oi) => {
        html += `<label class="quiz-option">
          <input type="radio" name="q${i}" value="${oi}"/>
          <span>${esc(opt)}</span>
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

        section.querySelectorAll('.quiz-question').forEach((el, i) => {
          const r = result.results[i];
          el.classList.add(r.is_right ? 'quiz-question--correct' : 'quiz-question--wrong');
          el.querySelectorAll('input').forEach((inp) => inp.disabled = true);
          if (!r.is_right) {
            const hint = document.createElement('p');
            hint.className = 'quiz-hint';
            hint.textContent = `${t('correctAnswer')} ${questions[i].options[r.correct_index]}`;
            el.appendChild(hint);
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
  function sanitize(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('script,iframe,object,embed').forEach((el) => el.remove());
    return div.innerHTML;
  }

  // English <-> Afrikaans: redraw whatever is on screen (a quiz in progress restarts)
  document.addEventListener('uilangchange', () => {
    renderHeaderGrade();
    if (view.name === 'post') openPost(view.id, false); else renderPostList();
  });

  await loadPosts();
})();
