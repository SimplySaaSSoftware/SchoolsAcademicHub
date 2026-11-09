/* i18n.js — English / Afrikaans interface text.
   One choice drives both the interface and which version of a post is shown.
   Stored on the device; for students with their own PIN it is also saved on their profile
   so it follows them to any device. Add a language by adding a block to STRINGS. */
const I18N_KEY = 'hub_lang';

const STRINGS = {
  en: {
    signIn: 'Sign in', continue: 'Continue', pin: 'PIN', enterPin: 'Enter your PIN',
    email: 'Email', password: 'Password', forgot: 'Forgot password?', backToSignIn: 'Back to sign in',
    resetIntro: "Enter your email and we'll send a reset link.", sendReset: 'Send Reset Link',
    staffLogin: 'Staff login (email & password)', studentPinLogin: '← Student PIN login',
    signingIn: 'Signing in…', verifying: 'Verifying…', sending: 'Sending…',
    resetSent: 'Reset link sent — check your email.', schoolNotFound: 'School not found.',
    loading: 'Loading…', loadingPosts: 'Loading lessons…', logout: 'Logout', language: 'Language',
    grade: 'Grade', term: 'Term', noPosts: 'No lessons available yet.', quiz: 'Quiz',
    questionOne: 'question', questionMany: 'questions', startQuiz: '▶ Start Quiz', submitQuiz: 'Submit Quiz',
    submitting: 'Submitting…', answerAll: 'Please answer all questions.', correctAnswer: 'Correct answer:',
    wellDone: 'Well done!', keepPracticing: 'Keep practising!', youScored: 'You scored', attempt: 'Attempt',
    retake: 'Retake Quiz', back: '← Back', attachments: 'Attachments', tapToView: 'Tap to view',
    setNewPassword: 'Set New Password', newPassword: 'New Password', confirmPassword: 'Confirm Password',
    updatePassword: 'Update Password', invalidLink: 'Invalid reset link.', noMatch: 'Passwords do not match.',
    pwShort: 'Password must be at least 8 characters.', updating: 'Updating…', pwUpdated: 'Password updated! Redirecting to login…',
    tabTodo: 'To do', tabDone: 'Done', tabAll: 'All', statusTodo: 'To do', statusDone: '✓ Done', statusRetry: 'Try again',
    best: 'Best', attemptOne: 'attempt', attemptMany: 'attempts', progressLine: '{done} of {total} done',
    allDoneTitle: 'All done! Great work 🎉', allDoneText: 'You have finished everything for now.', showAll: 'Show everything',
    nothingDone: 'Nothing finished yet. Open a lesson to get started.', notTaken: 'Not taken yet',
    tabLessons: 'Lessons', tabChannels: 'Channels', tabCalendar: 'Calendar',
    allTerms: 'All Terms',
    noChannels: 'No channels available yet.',
    upcomingEvents: 'Upcoming Events', noUpcomingEvents: 'No upcoming events.',
    'err:Invalid PIN': 'Invalid PIN',
    'err:Invalid credentials': 'Invalid email or password',
    'err:Too many failed attempts': 'Too many failed attempts. Please wait 10 minutes and try again.',
    'err:Session expired': 'Session expired',
  },
  af: {
    signIn: 'Meld aan', continue: 'Gaan voort', pin: 'PIN', enterPin: 'Voer jou PIN in',
    email: 'E-pos', password: 'Wagwoord', forgot: 'Wagwoord vergeet?', backToSignIn: 'Terug na aanmelding',
    resetIntro: "Voer jou e-pos in en ons stuur 'n skakel om jou wagwoord terug te stel.", sendReset: 'Stuur terugstel-skakel',
    staffLogin: 'Personeelaanmelding (e-pos en wagwoord)', studentPinLogin: '← Leerder-PIN-aanmelding',
    signingIn: 'Meld tans aan…', verifying: 'Verifieer tans…', sending: 'Stuur tans…',
    resetSent: 'Terugstel-skakel gestuur — kyk jou e-pos.', schoolNotFound: 'Skool nie gevind nie.',
    loading: 'Laai tans…', loadingPosts: 'Laai tans lesse…', logout: 'Teken uit', language: 'Taal',
    grade: 'Graad', term: 'Kwartaal', noPosts: 'Daar is nog geen lesse beskikbaar nie.', quiz: 'Vasvra',
    questionOne: 'vraag', questionMany: 'vrae', startQuiz: '▶ Begin vasvra', submitQuiz: 'Dien vasvra in',
    submitting: 'Dien tans in…', answerAll: 'Beantwoord asseblief al die vrae.', correctAnswer: 'Korrekte antwoord:',
    wellDone: 'Mooi so!', keepPracticing: 'Bly oefen!', youScored: 'Jy het behaal', attempt: 'Poging',
    retake: 'Probeer weer', back: '← Terug', attachments: 'Aanhangsels', tapToView: 'Tik om te sien',
    setNewPassword: 'Stel nuwe wagwoord', newPassword: 'Nuwe wagwoord', confirmPassword: 'Bevestig wagwoord',
    updatePassword: 'Opdateer wagwoord', invalidLink: 'Ongeldige terugstel-skakel.', noMatch: 'Wagwoorde stem nie ooreen nie.',
    pwShort: 'Wagwoord moet ten minste 8 karakters wees.', updating: 'Opdateer tans…', pwUpdated: 'Wagwoord opgedateer! Stuur jou na aanmelding…',
    tabTodo: 'Om te doen', tabDone: 'Klaar', tabAll: 'Almal', statusTodo: 'Om te doen', statusDone: '✓ Klaar', statusRetry: 'Probeer weer',
    best: 'Beste', attemptOne: 'poging', attemptMany: 'pogings', progressLine: '{done} van {total} klaar',
    allDoneTitle: 'Alles klaar! Puik werk 🎉', allDoneText: 'Jy het vir eers alles voltooi.', showAll: 'Wys alles',
    nothingDone: 'Nog niks voltooi nie. Maak \'n les oop om te begin.', notTaken: 'Nog nie gedoen nie',
    tabLessons: 'Lesse', tabChannels: 'Kanale', tabCalendar: 'Kalender',
    allTerms: 'Alle kwartale',
    noChannels: 'Nog geen kanale beskikbaar nie.',
    upcomingEvents: 'Komende Gebeure', noUpcomingEvents: 'Geen komende gebeure nie.',
    'err:Invalid PIN': 'Ongeldige PIN',
    'err:Invalid credentials': 'Ongeldige e-pos of wagwoord',
    'err:Too many failed attempts': 'Te veel mislukte pogings. Wag asseblief 10 minute en probeer weer.',
    'err:Session expired': 'Sessie het verval',
  },
};

function currentLang() {
  let l = null;
  try { l = localStorage.getItem(I18N_KEY); } catch {}
  if (l === 'en' || l === 'af') return l;
  return (navigator.language || '').toLowerCase().startsWith('af') ? 'af' : 'en';
}

/** t('grade') → 'Graad'. Missing keys fall back to English, then the key itself. */
function t(key, vars) {
  const s = STRINGS[currentLang()][key] ?? STRINGS.en[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : s;
}

/** Translate a message that came from the server (matched by its start); unknown messages pass through. */
function tErr(msg) {
  const m = String(msg ?? '');
  const hit = Object.keys(STRINGS.en).find((k) => k.startsWith('err:') && m.startsWith(k.slice(4)));
  return hit ? t(hit) : m;
}

/** Fill every [data-i18n], [data-i18n-placeholder] and [data-i18n-aria] element. */
function applyI18n(root = document) {
  document.documentElement.lang = currentLang();
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('.lang-toggle__btn').forEach((b) => {
    const on = b.dataset.lang === currentLang();
    b.classList.toggle('lang-toggle__btn--on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

function setUiLang(l) {
  if (l !== 'en' && l !== 'af') return;
  try { localStorage.setItem(I18N_KEY, l); } catch {}
  applyI18n();
  // Students with their own PIN: remember it on their profile too (fire and forget)
  try {
    const s = JSON.parse(sessionStorage.getItem('hps_session') || 'null');
    if (s?.individual && s.token && typeof apiPost === 'function') apiPost('/me/language', { lang: l }).catch(() => {});
  } catch {}
  document.dispatchEvent(new CustomEvent('uilangchange', { detail: l }));
}

/** Render the EN | AF switch into a container. */
function mountLangToggle(container) {
  container.innerHTML = `<div class="lang-toggle" role="group" data-i18n-aria="language">
    <button type="button" class="lang-toggle__btn" data-lang="en" title="English">EN</button>
    <button type="button" class="lang-toggle__btn" data-lang="af" title="Afrikaans">AF</button></div>`;
  container.querySelectorAll('.lang-toggle__btn').forEach((b) => b.addEventListener('click', () => setUiLang(b.dataset.lang)));
  applyI18n(container);
}
