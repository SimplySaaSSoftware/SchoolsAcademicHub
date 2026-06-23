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

  const badge = document.getElementById('grade-badge');
  if (badge && session.grade) badge.textContent = `Grade ${session.grade}`;
  document.getElementById('btn-logout').addEventListener('click', logout);

  function showNotify(msg, isError = false) {
    notify.textContent = msg;
    notify.className   = `notification${isError ? ' notification--error' : ''}`;
    notify.hidden      = false;
    setTimeout(() => { notify.hidden = true; }, 3500);
  }

  // ── Post list ───────────────────────────────────────────────
  let allPosts = [];

  async function loadPosts() {
    main.innerHTML = '<p class="loading-text">Loading posts…</p>';
    try {
      allPosts = await apiGet(`/posts?school_id=${SCHOOL_SLUG}`);
    } catch (e) {
      main.innerHTML = `<p class="loading-text" style="color:red">${e.message}</p>`;
      return;
    }
    renderPostList();
  }

  function renderPostList() {
    if (!allPosts.length) {
      main.innerHTML = '<p class="loading-text">No posts available yet.</p>';
      return;
    }

    // Group by subject
    const bySubject = {};
    allPosts.forEach((p) => {
      (bySubject[p.subject] = bySubject[p.subject] || []).push(p);
    });

    let html = '<div class="posts-grid">';
    Object.entries(bySubject).forEach(([subject, posts]) => {
      html += `<section class="subject-section">
        <h2 class="subject-heading">${esc(subject)}</h2>
        <div class="cards">`;
      posts.forEach((p) => {
        const hasQuiz = (() => { try { return JSON.parse(p.quiz_json || '[]').length > 0; } catch { return false; } })();
        html += `<article class="post-card" data-id="${esc(p.id)}" role="button" tabindex="0">
          <div class="post-card__header">
            <h3 class="post-card__title">${esc(p.title)}</h3>
            ${hasQuiz ? '<span class="badge badge--quiz">Quiz</span>' : ''}
          </div>
          <p class="post-card__meta">Term ${esc(p.term)} &bull; Grade ${esc(String(p.grade))}</p>
        </article>`;
      });
      html += '</div></section>';
    });
    html += '</div>';
    main.innerHTML = html;

    main.querySelectorAll('.post-card').forEach((card) => {
      const open = () => openPost(card.dataset.id);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(); });
    });
  }

  // ── Post view ───────────────────────────────────────────────
  async function openPost(id) {
    main.innerHTML = '<p class="loading-text">Loading…</p>';
    let post;
    try {
      post = await apiGet(`/posts/${id}`);
    } catch (e) {
      main.innerHTML = `<p class="loading-text" style="color:red">${e.message}</p>`;
      return;
    }

    // Track activity (fire and forget)
    apiPost('/activity/post-opened', {
      post_id: post.id, post_title: post.title, subject: post.subject, term: post.term,
    }).catch(() => {});

    const questions   = (() => { try { return JSON.parse(post.quiz_json || '[]'); } catch { return []; } })();
    const attachments = (() => { try { return JSON.parse(post.attachments_json || '[]'); } catch { return []; } })();
    const attachHtml  = attachments.length ? `
      <div class="attachments" style="margin:1rem 0">
        <h4 style="margin:0 0 .5rem">Attachments</h4>
        ${attachments.map((a) => {
          const name        = typeof a === 'string' ? a : a.name;
          const rawId       = typeof a === 'string' ? a : a.driveId;
          const isDriveId   = rawId && !rawId.startsWith('http');
          const previewUrl  = isDriveId ? `https://drive.google.com/file/d/${encodeURIComponent(rawId)}/preview` : rawId;
          const downloadUrl = isDriveId ? `https://drive.google.com/uc?id=${encodeURIComponent(rawId)}&export=download` : rawId;
          return `<div class="attachment-item">
            <details class="attachment-expander">
              <summary>📎 ${esc(name)}</summary>
              <iframe src="${esc(previewUrl)}" class="attachment-frame" allowfullscreen loading="lazy"></iframe>
            </details>
            <a href="${esc(downloadUrl)}" target="_blank" rel="noopener" class="attachment-dl" title="Download">⬇</a>
          </div>`;
        }).join('')}
      </div>` : '';

    main.innerHTML = `
      <div class="post-view">
        <button id="btn-back" class="btn btn--secondary btn--sm" style="margin-bottom:1rem;">&larr; Back</button>
        <h1 class="post-view__title">${esc(post.title)}</h1>
        <p class="post-view__meta">Grade ${esc(String(post.grade))} &bull; ${esc(post.subject)} &bull; Term ${esc(post.term)}</p>
        <div class="post-content" id="post-content">${sanitize(post.content_html ?? '')}</div>
        ${attachHtml}
        ${questions.length ? '<div id="quiz-section"></div>' : ''}
      </div>`;

    document.getElementById('btn-back').addEventListener('click', renderPostList);

    if (questions.length) {
      renderQuiz(questions, post);
    }
  }

  // ── Quiz renderer ───────────────────────────────────────────
  function renderQuiz(questions, post) {
    const section = document.getElementById('quiz-section');
    let html = '<div class="quiz-card"><h2 class="quiz-title">Quiz</h2>';
    questions.forEach((q, i) => {
      html += `<div class="quiz-question" data-index="${i}">
        <p class="quiz-question__text"><strong>Q${i + 1}.</strong> ${esc(q.question)}</p>
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
      <button id="btn-submit-quiz" class="btn btn--primary" style="margin-top:1rem;">Submit Quiz</button>
    </div>`;
    section.innerHTML = html;

    const startTime = Date.now();
    document.getElementById('btn-submit-quiz').addEventListener('click', async () => {
      const answers = [];
      let allAnswered = true;
      questions.forEach((q, i) => {
        const sel = section.querySelector(`input[name="q${i}"]:checked`);
        if (!sel) { allAnswered = false; return; }
        answers.push({ question: q.question, selected_index: Number(sel.value), selected_text: q.options[Number(sel.value)], correct: Number(sel.value) === q.correct_index });
      });
      if (!allAnswered) { showNotify('Please answer all questions.', true); return; }

      const score   = answers.filter((a) => a.correct).length;
      const btn     = document.getElementById('btn-submit-quiz');
      btn.disabled  = true; btn.textContent = 'Submitting…';

      try {
        const result = await apiPost('/activity/quiz-attempt', {
          post_id: post.id, post_title: post.title, subject: post.subject, term: post.term,
          score, total: questions.length, answers,
          time_taken_seconds: Math.round((Date.now() - startTime) / 1000),
        });

        // Show results
        section.querySelectorAll('.quiz-question').forEach((el, i) => {
          const a = answers[i];
          el.classList.add(a.correct ? 'quiz-question--correct' : 'quiz-question--wrong');
          el.querySelectorAll('input').forEach((inp) => inp.disabled = true);
          if (!a.correct) {
            const hint = document.createElement('p');
            hint.className = 'quiz-hint';
            hint.textContent = `Correct answer: ${questions[i].options[questions[i].correct_index]}`;
            el.appendChild(hint);
          }
        });

        const resultEl = document.getElementById('quiz-result');
        const pct      = result.percentage;
        resultEl.className = `quiz-result ${pct >= 80 ? 'quiz-result--pass' : 'quiz-result--fail'}`;
        resultEl.innerHTML = `<strong>${pct >= 80 ? 'Well done!' : 'Keep practising!'}</strong>
          You scored ${score}/${questions.length} (${pct}%)${result.attempt_number > 1 ? ` — Attempt ${result.attempt_number}` : ''}.`;
        resultEl.hidden = false;
        btn.textContent = 'Retake Quiz';
        btn.disabled    = false;
        btn.addEventListener('click', () => renderQuiz(questions, post), { once: true });
      } catch (err) {
        showNotify(err.message, true);
        btn.disabled = false; btn.textContent = 'Submit Quiz';
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

  await loadPosts();
})();
