/* i18n-staff.js — Afrikaans for the teacher (and later admin) screens.

   Instead of wrapping every string in t('key'), the screen is translated AS IT IS DRAWN:
   a watcher looks at every piece of text and every placeholder/tooltip the page adds, and swaps
   English for Afrikaans using the dictionaries below. Switching language swaps the text in place,
   so nothing is redrawn and an unsaved post is never lost.

   To translate something new: add the exact English text to STAFF_AF (or a pattern to
   STAFF_PATTERNS when it contains a name or number). Anything missing simply stays English.
   Teacher-written content (posts, quiz text, names) is never touched: it is only ever replaced
   when it equals a dictionary phrase exactly, and the editor/post areas are skipped entirely. */

const STAFF_AF = {};
const STAFF_PATTERNS = [];

/** Add Afrikaans phrases. */
function addStaffAf(entries) { Object.assign(STAFF_AF, entries); }

const STAFF_SKIP = 'script,style,textarea,.ql-editor,.ql-tooltip,[contenteditable="true"],.post-content,.tr-orig,.title-alt,[translate="no"],.notranslate,code,pre';
const STAFF_ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'data-label', 'data-placeholder'];

const staffOrig = new WeakMap();   // text node -> { orig, applied }
const staffAttrOrig = new WeakMap();   // element -> { attr: { orig, applied } }

function staffNorm(s) { return String(s).replace(/\s+/g, ' ').trim(); }

/** Afrikaans for an English UI phrase, or the same text if there is no translation. */
function staffTx(text) {
  const raw = String(text ?? '');
  const key = staffNorm(raw);
  if (!key) return raw;
  let out = STAFF_AF[key];
  if (out === undefined) {
    for (const [re, rep] of STAFF_PATTERNS) {
      if (re.test(key)) { out = key.replace(re, rep); break; }
    }
  }
  if (out === undefined) return raw;
  const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
  return lead + out + trail;
}

const staffWanted = () => currentLang() === 'af';
const staffSkipped = (el) => !el || !el.closest || el.closest(STAFF_SKIP);

function staffText(node) {
  if (staffSkipped(node.parentElement)) return;
  let rec = staffOrig.get(node);
  if (!rec || node.data !== rec.applied) rec = { orig: node.data, applied: node.data };   // the app wrote new text
  const next = staffWanted() ? staffTx(rec.orig) : rec.orig;
  if (next !== node.data) node.data = next;
  rec.applied = node.data;
  staffOrig.set(node, rec);
}

function staffAttrs(el) {
  if (staffSkipped(el)) return;
  let rec = staffAttrOrig.get(el);
  if (!rec) rec = {};
  const names = el.tagName === 'INPUT' && /^(button|submit)$/.test(el.type) ? [...STAFF_ATTRS, 'value'] : STAFF_ATTRS;
  for (const a of names) {
    if (!el.hasAttribute(a)) continue;
    const cur = el.getAttribute(a);
    let r = rec[a];
    if (!r || cur !== r.applied) r = { orig: cur, applied: cur };
    const next = staffWanted() ? staffTx(r.orig) : r.orig;
    if (next !== cur) el.setAttribute(a, next);
    r.applied = next;
    rec[a] = r;
  }
  staffAttrOrig.set(el, rec);
}

function staffTree(root) {
  if (!root) return;
  if (root.nodeType === 3) { staffText(root); return; }
  if (root.nodeType !== 1) return;
  staffAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) { if (n.nodeType === 3) staffText(n); else staffAttrs(n); }
}

/** Start translating the page. Call once after the scripts have loaded. */
function startStaffTranslation() {
  const run = () => { document.documentElement.lang = currentLang(); staffTree(document.body); document.title = staffWanted() ? staffTx(document.title) : document.title; };
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(staffTree);
      else if (r.type === 'characterData') staffText(r.target);
      else if (r.type === 'attributes') staffAttrs(r.target);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: STAFF_ATTRS });
  document.addEventListener('uilangchange', run);
  document.documentElement.lang = currentLang();

  // Browser pop-ups (confirm / alert / prompt) are plain text, so translate those too
  for (const fn of ['confirm', 'alert', 'prompt']) {
    const orig = window[fn].bind(window);
    window[fn] = (msg, ...rest) => orig(staffWanted() ? staffTx(msg) : msg, ...rest);
  }
  run();
}

/** For tests and for finding gaps: the English text on screen that has no Afrikaans yet. */
function staffMissing(root = document.body) {
  const out = new Set();
  const consider = (s) => {
    const k = staffNorm(s);
    if (!k || !/[A-Za-z]{3,}/.test(k)) return;
    if (STAFF_AF[k] !== undefined || STAFF_PATTERNS.some(([re]) => re.test(k))) return;
    out.add(k);
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeType === 3) { if (!staffSkipped(n.parentElement)) { const r = staffOrig.get(n); consider(r ? r.orig : n.data); } }
    else if (!staffSkipped(n)) for (const a of STAFF_ATTRS) if (n.hasAttribute(a)) { const r = (staffAttrOrig.get(n) || {})[a]; consider(r ? r.orig : n.getAttribute(a)); }
  }
  return [...out];
}
