/* safe-html.js — makes teacher-written HTML safe to show, and handles YouTube videos.
   Used wherever post content is rendered (student portal, teacher preview and review screens). */

// Only YouTube embeds are allowed inside posts. Anything else in an <iframe> is removed.
const YT_EMBED = /^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\/[A-Za-z0-9_-]{11}(?:\?start=\d{1,6})?$/;

/** Turns any normal YouTube link (watch, youtu.be, shorts, live, embed, or a bare 11-character id) into the privacy-friendly embed address. Returns null if it is not YouTube. */
function youtubeEmbedUrl(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  let id = null;
  let start = 0;
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) id = text;
  else {
    let u;
    try { u = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text); } catch { return null; }
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') id = u.pathname.split('/')[1];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else { const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/); id = m && m[1]; }
    }
    const t = u.searchParams.get('t') || u.searchParams.get('start');   // "90", "90s", "1m30s"
    if (t) {
      const parts = String(t).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
      if (parts) start = (+parts[1] || 0) * 3600 + (+parts[2] || 0) * 60 + (+parts[3] || 0);
    }
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}${start > 0 && start < 1000000 ? '?start=' + start : ''}`;
}

/** Removes anything that could run code or load something unexpected; keeps normal formatting, images and YouTube videos. */
function safeHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html ?? ''}</div>`, 'text/html');
  const root = doc.body.firstElementChild;

  root.querySelectorAll('script,style,object,embed,applet,link,meta,base,form,input,button,textarea,select,frame,frameset')
    .forEach((el) => el.remove());

  root.querySelectorAll('iframe').forEach((f) => {
    const src = f.getAttribute('src') || '';
    if (!YT_EMBED.test(src)) { f.remove(); return; }
    // Rebuild the iframe ourselves so nothing extra from the original survives
    const n = doc.createElement('iframe');
    n.className = 'ql-video yt-embed';
    n.setAttribute('src', src);
    n.setAttribute('title', 'YouTube video');
    n.setAttribute('allowfullscreen', '');
    n.setAttribute('loading', 'lazy');
    n.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    n.setAttribute('allow', 'encrypted-media; picture-in-picture; fullscreen');
    n.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox');
    f.replaceWith(n);
  });

  root.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const name = a.name.toLowerCase();
      if (name.startsWith('on')) { el.removeAttribute(a.name); continue; }          // onclick, onerror, ...
      if (['href', 'src', 'xlink:href', 'action', 'formaction', 'srcdoc'].includes(name)
          && (name === 'srcdoc' || /^(javascript|vbscript|data:text\/html)/i.test(a.value.replace(/[\u0000- ]/g, '')))) {
        el.removeAttribute(a.name);
      }
    }
    if (el.tagName === 'A' && el.getAttribute('target')) el.setAttribute('rel', 'noopener noreferrer');
  });
  return root.innerHTML;
}

/** Quill toolbar handler: asks for a YouTube link and puts the video in the editor. */
function quillInsertYouTube(quill) {
  const input = window.prompt('Paste a YouTube link (for example https://youtu.be/…)');
  if (input === null) return;
  const url = youtubeEmbedUrl(input);
  if (!url) { alert('That does not look like a YouTube link. Copy the address from the YouTube Share button.'); return; }
  const range = quill.getSelection(true);
  const at = range ? range.index : quill.getLength();
  quill.insertEmbed(at, 'video', url, 'user');
  quill.insertText(at + 1, '\n', 'user');
  quill.setSelection(at + 2, 0, 'user');
}
