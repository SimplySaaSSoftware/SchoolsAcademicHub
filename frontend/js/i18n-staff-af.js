/* Afrikaans phrases for the teacher screens (see i18n-staff.js for how this works).
   Left: the exact English text on screen. Right: Afrikaans. Patterns (further down) cover text with names or numbers.
   The Afrikaans here was written by Claude: have a teacher read it, and fix any phrase in one line. */

const LANG_NOUN = { English: 'Engels', Afrikaans: 'Afrikaans' };
const LANG_ADJ  = { English: 'Engelse', Afrikaans: 'Afrikaanse' };
const lcFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

addStaffAf({
  // ── Header, navigation, common buttons ──
  'Logout': 'Teken uit', '← Back': '← Terug', '← Dashboard': '← Paneelbord', '× Close': '× Maak toe',
  'Dashboard': 'Paneelbord', 'Loading…': 'Laai tans…', 'Saving…': 'Stoor tans…', 'Saved.': 'Gestoor.',
  'Preview': 'Voorskou', 'Edit': 'Wysig', 'Delete': 'Skrap', 'Stats': 'Statistiek', 'Update': 'Dateer op',
  'Publish': 'Publiseer', 'Save Draft': 'Stoor konsep', 'Save draft': 'Stoor konsep', 'Copy': 'Kopieer', 'Print': 'Druk',
  'Download': 'Laai af', 'Download CSV': 'Laai CSV af', 'Fullscreen': 'Volskerm', 'Language': 'Taal',
  'Deactivate': 'Deaktiveer', 'Select…': 'Kies…', 'Width:': 'Wydte:',

  // ── Dashboard and lists ──
  '+ New Post': '+ Nuwe les', 'All Posts': 'Alle lesse', 'Students': 'Leerders', 'Student': 'Leerder',
  'All grades': 'Alle grade', 'View →': 'Kyk →',
  'Published': 'Gepubliseer', 'Drafts': 'Konsepte', 'Student views': 'Leerderkyke', 'Avg quiz score': 'Gem. vasvra-telling',
  'published': 'gepubliseer', 'draft': 'konsep', 'drafts': 'konsepte', 'viewers': 'kykers', 'quiz': 'vasvra', 'quizzes': 'vasvrae',
  'Avg score': 'Gem. telling', 'Avg': 'Gem.', 'Unique viewers': 'Unieke kykers', 'Quiz attempts': 'Vasvra-pogings',
  'Pass rate': 'Slaagsyfer', 'Viewers': 'Kykers', 'Attempts': 'Pogings',
  'Title': 'Titel', 'Grade': 'Graad', 'Subject': 'Vak', 'Term': 'Kwartaal', 'Status': 'Status', 'Author': 'Skrywer',
  'No posts yet.': 'Nog geen lesse nie.', 'No posts yet. Tap “+ New Post” to get started.': 'Nog geen lesse nie. Tik “+ Nuwe les” om te begin.',
  'Post deleted.': 'Les geskrap.', 'Post published!': 'Les gepubliseer!', 'Draft saved.': 'Konsep gestoor.',

  // ── Post editor ──
  'Edit Post': 'Wysig les', 'New Post': 'Nuwe les', 'Post title': 'Lestitel', 'Title *': 'Titel *', 'Grade *': 'Graad *',
  'Subject *': 'Vak *', 'Term *': 'Kwartaal *', 'Language this post is written in *': 'Taal waarin hierdie les geskryf is *',
  'Delete the translation to change this': 'Skrap die vertaling om dit te verander',
  'Content': 'Inhoud', 'Attachments': 'Aanhangsels', '+ Add File': '+ Voeg lêer by', 'Quiz': 'Vasvra', '+ Question': '+ Vraag',
  'Hide post content while quiz is active': 'Versteek lesinhoud terwyl die vasvra aan die gang is',
  'No questions yet.': 'Nog geen vrae nie.', 'Select the correct answer with the radio button.': 'Kies die korrekte antwoord met die keuseknoppie.',
  'Write lesson content here…': 'Skryf die lesinhoud hier…', 'Question text (tap 🖼 to add an image)…': 'Vraagteks (tik op 🖼 om \'n prent by te voeg)…',
  'Save the post first, then you can create the other language version with AI.': 'Stoor eers die les, dan kan jy die ander taalweergawe met KI skep.',
  'Title is required.': 'Titel is verpligtend.', 'Subject is required.': 'Vak is verpligtend.', 'Term is required.': 'Kwartaal is verpligtend.',
  'Select grade and subject before uploading files.': 'Kies graad en vak voordat jy lêers oplaai.',
  'Tap to view': 'Tik om te sien',

  // ── Other-language version panel and review screen ──
  '✨ Generate with AI': '✨ Genereer met KI', 'Write it myself': 'Skryf dit self', 'View / edit': 'Kyk / wysig',
  'Review & verify': 'Hersien en verifieer', '↻ Regenerate with AI': '↻ Genereer weer met KI',
  'AI draft —': 'KI-konsep —', 'Draft —': 'Konsep —', 'not visible to students': 'nie sigbaar vir leerders nie',
  'until you check it and mark it verified.': 'totdat jy dit nagegaan het en as geverifieer gemerk het.',
  'Hidden from students': 'Versteek vir leerders', 'until you re-check it.': 'totdat jy dit weer nagaan.',
  '✓ Save & mark verified': '✓ Stoor en merk as geverifieer',
  'AI draft ready. Please review it before marking it verified.': 'KI-konsep gereed. Hersien dit asseblief voordat jy dit as geverifieer merk.',
  'Translating… (up to 40s)': 'Vertaal tans… (tot 40s)',
  'Fill in every quiz answer before verifying.': 'Vul elke vasvra-antwoord in voordat jy verifieer.',
  'Verified. Students can now switch language.': 'Geverifieer. Leerders kan nou van taal wissel.',

  // ── Preview, stats ──
  'Student view': 'Leerderaansig', 'Submit Quiz': 'Dien vasvra in',
  'Post Stats': 'Les-statistiek', 'Unique Viewers': 'Unieke kykers', 'Quiz Attempts': 'Vasvra-pogings', 'Avg Score': 'Gem. telling',
  'Pass Rate': 'Slaagsyfer', 'Export Viewers (Excel)': 'Voer kykers uit (Excel)', 'Export Quiz Results (Excel)': 'Voer vasvra-uitslae uit (Excel)',
  'Opened At': 'Oopgemaak om', 'Quiz Results': 'Vasvra-uitslae', 'Attempt': 'Poging', 'Score': 'Telling', 'Passed': 'Geslaag',
  'No views tracked yet.': 'Nog geen kyke aangeteken nie.',

  // ── Students screen ──
  '⬇ Export Excel': '⬇ Voer Excel uit', '⬆ Import Excel': '⬆ Voer Excel in', '+ Add Student': '+ Voeg leerder by', 'Add Student': 'Voeg leerder by',
  'Search name…': 'Soek naam…', 'Reset PIN': 'Herstel PIN', 'All subjects': 'Alle vakke', 'Subjects': 'Vakke',
  'PINs are shown once, when created or reset. They are not stored, so use': 'PIN\'s word net een keer gewys, wanneer dit geskep of herstel word. Dit word nie gestoor nie, so gebruik',
  'if one is lost.': 'as een verlore raak.',
  'Full name *': 'Volle naam *', 'Create & show PIN': 'Skep en wys PIN', 'Student created': 'Leerder geskep', 'New PIN': 'Nuwe PIN',
  'Tick none to give the student every subject for their grade.': 'Merk geen om die leerder elke vak vir sy of haar graad te gee nie.',
  'No subjects set up yet.': 'Nog geen vakke opgestel nie.',
  'Save these PINs now.': 'Stoor hierdie PIN\'s nou.', 'They cannot be shown again.': 'Dit kan nie weer gewys word nie.',
  'Name is required.': 'Naam is verpligtend.', 'Copied.': 'Gekopieer.', 'Copy failed. Use Download CSV.': 'Kopiëring het misluk. Gebruik Laai CSV af.',
  'Pop-up blocked. Use Download CSV instead.': 'Opspringer geblokkeer. Gebruik eerder Laai CSV af.',
  'Student updated.': 'Leerder opgedateer.', 'Student deactivated.': 'Leerder gedeaktiveer.', 'Student deleted.': 'Leerder geskrap.',
  'Downloaded. Edit it in Excel, then use Import Excel.': 'Afgelaai. Wysig dit in Excel en gebruik dan Voer Excel in.',

  // ── Excel import: check before saving ──
  'Check before saving': 'Kontroleer voor stoor', 'Checking file…': 'Kontroleer lêer…', 'new': 'nuut', 'changed': 'verander', 'same': 'dieselfde', 'problems': 'probleme',
  'Nothing has been saved.': 'Niks is gestoor nie.', 'Fix these rows in Excel and import again:': 'Maak hierdie rye in Excel reg en voer weer in:',
  'New students': 'Nuwe leerders', '(each gets a PIN)': '(elkeen kry \'n PIN)', 'Changed': 'Verander',
  'Save these changes': 'Stoor hierdie veranderinge', 'Saved.': 'Gestoor.',
  'Nothing to change. The file matches what is already saved.': 'Niks om te verander nie. Die lêer stem ooreen met wat reeds gestoor is.',
  'Name is missing.': 'Naam ontbreek.', 'Name is too long (80 characters at most).': 'Naam is te lank (hoogstens 80 karakters).',
  'Student ID not found. Export a fresh file, or clear the ID to add a new student.': 'Leerder-ID nie gevind nie. Voer \'n nuwe lêer uit, of maak die ID leeg om \'n nuwe leerder by te voeg.',
  'That student is not in your grade.': 'Daardie leerder is nie in jou graad nie.',
  'Student deactivated': 'Leerder gedeaktiveer',

  // ── Channels ──
  'Channels': 'Kanale', 'Calendar': 'Kalender',
  'New Channel': 'Nuwe kanaal', 'New Sub-channel': 'Nuwe subkanaal', 'Rename Channel': 'Hernoem kanaal',
  'Channel Name (English) *': 'Kanaalnaam (Engels) *', 'Channel Name (Afrikaans)': 'Kanaalnaam (Afrikaans)',
  'Channel name is required.': 'Kanaalnaam is verpligtend.',
  'Channel renamed.': 'Kanaal hernoem.', 'Channel created.': 'Kanaal geskep.', 'Channel deleted.': 'Kanaal geskrap.',
  'Add sub-channel': 'Voeg subkanaal by', 'Rename': 'Hernoem',
  'No channels yet. Create one to get started.': 'Nog geen kanale nie. Skep een om te begin.',
  'Select a channel to view posts.': 'Kies \'n kanaal om plasings te sien.',
  'No posts in this channel yet.': 'Nog geen plasings in hierdie kanaal nie.',
  '+ New Post': '+ Nuwe plasing',
  'Post published!': 'Plasing gepubliseer!', 'Draft saved.': 'Konsep gestoor.', 'Post deleted.': 'Plasing geskrap.',
  'Title is required.': 'Titel is verpligtend.',
  'Link to Calendar Event (optional)': 'Koppel aan kalendergebeurtenis (opsioneel)',
  'Language this post is written in': 'Taal waarin hierdie plasing geskryf is',
  'Save Draft': 'Stoor konsep', 'Unpublish': 'Depubliseer', 'Update': 'Dateer op', 'Translate': 'Vertaal',
  'Save Draft': 'Stoor konsep',
  'Translate': 'Vertaal',
  'Translation saved as draft.': 'Vertaling as konsep gestoor.', 'Translation verified.': 'Vertaling geverifieer.',
  'Write channel post content here…': 'Skryf kanaalpasinhoud hier…',
  'Write translation here…': 'Skryf vertaling hier…',

  // ── Calendar ──
  'New Event': 'Nuwe gebeurtenis', 'Edit Event': 'Wysig gebeurtenis', 'Create Event': 'Skep gebeurtenis',
  'Title (English) *': 'Titel (Engels) *', 'Title (Afrikaans)': 'Titel (Afrikaans)',
  'Start Date *': 'Begindatum *', 'End Date': 'Einddatum',
  'Description (English)': 'Beskrywing (Engels)', 'Description (Afrikaans)': 'Beskrywing (Afrikaans)',
  'Location': 'Ligging',
  'Event updated.': 'Gebeurtenis opgedateer.', 'Event created.': 'Gebeurtenis geskep.', 'Event deleted.': 'Gebeurtenis geskrap.',
  'Title is required.': 'Titel is verpligtend.', 'Start date is required.': 'Begindatum is verpligtend.',
  'No events yet. Tap "+ Add Event" to get started.': 'Nog geen gebeure nie. Tik "+ Voeg gebeurtenis by" om te begin.',
  'Loading channels…': 'Laai kanale tans…', 'Loading calendar…': 'Laai kalender tans…',
  '+ New Channel': '+ Nuwe kanaal', '+ Add Event': '+ Voeg gebeurtenis by',
  'Event name': 'Naam van gebeurtenis', 'Event naam in Afrikaans': 'Event naam in Afrikaans',
  'e.g. School Hall': 'bv. Skoolsaal', 'Event details…': 'Besonderhede van die gebeurtenis…',
  'Beschrywing in Afrikaans…': 'Beskrywing in Afrikaans…',

  // ── Messages from the server that teachers can see ──
  'Google Drive is not connected. A super admin must open Super Admin → Google Drive → Connect Google Drive.': 'Google Drive is nie gekoppel nie. \'n Superadmin moet Superadmin → Google Drive → Koppel Google Drive oopmaak.',
  'Too many failed attempts. Please wait 10 minutes and try again.': 'Te veel mislukte pogings. Wag asseblief 10 minute en probeer weer.',
  'Session expired': 'Sessie het verval',
});

// Text that contains names, numbers or a language. Each: [pattern, replacement (string or function)]
const addPattern = (re, rep) => STAFF_PATTERNS.push([re, rep]);
const grade = (n) => `Graad ${n}`;

addPattern(/^Grade (\d+) Dashboard$/, 'Graad $1 Paneelbord');
addPattern(/^(·\s*)?Grade (\d+)$/, (_, dot, n) => `${dot || ''}${grade(n)}`);
addPattern(/^(.+) · Grade (\d+)$/, (_, a, n) => `${staffTx(a)} · ${grade(n)}`);
addPattern(/^(.+) · Inactive$/, (_, a) => `${a} · Onaktief`);
addPattern(/^Grade (\d+) • (.+) • Term (.+)$/, (_, g, s, t) => `${grade(g)} • ${staffTx(s)} • Kwartaal ${t}`);
addPattern(/^· (draft)$/, '· konsep');
addPattern(/^(EN|AF) · AI draft$/, '$1 · KI-konsep');
addPattern(/^(EN|AF) ⚠ re-check$/, '$1 ⚠ kyk na');
addPattern(/^Question (\d+)$/, 'Vraag $1');
addPattern(/^Q(\d+)$/, 'V$1');
addPattern(/^Option (\d+)$/, 'Opsie $1');
addPattern(/^Row (\d+)$/, 'Ry $1');
addPattern(/^(\d+) (new student|new students) added$/, (_, n) => `${n} nuwe leerder${n === '1' ? '' : 's'} bygevoeg`);
addPattern(/^(\d+) students? created$/, (_, n) => `${n} leerder${n === '1' ? '' : 's'} geskep`);
addPattern(/^(\d+) draft$/, '$1 konsep');
addPattern(/^(\d+) drafts$/, '$1 konsepte');
addPattern(/^(\d+) quiz$/, '$1 vasvra');
addPattern(/^(\d+) quizzes$/, '$1 vasvrae');
addPattern(/^(\d+) (published)$/, '$1 gepubliseer');
addPattern(/^(\d+) viewers$/, '$1 kykers');

// Languages inside sentences ("English version", "No English version yet…")
addPattern(/^(English|Afrikaans) version$/, (_, l) => `${LANG_ADJ[l]} weergawe`);
addPattern(/^(English|Afrikaans) answer$/, (_, l) => `${LANG_ADJ[l]} antwoord`);
addPattern(/^Show (English|Afrikaans) original$/, (_, l) => `Wys die ${LANG_ADJ[l]} oorspronklike`);
addPattern(/^No (English|Afrikaans) version yet\. Students only see (English|Afrikaans)\.$/, (_, a, b) => `Nog geen ${LANG_ADJ[a]} weergawe nie. Leerders sien slegs ${LANG_NOUN[b]}.`);
addPattern(/^✓ Verified( by (.+))?\. Students can switch to (English|Afrikaans)\.$/, (_, __, who, l) => `✓ Geverifieer${who ? ' deur ' + who : ''}. Leerders kan oorskakel na ${LANG_NOUN[l]}.`);
addPattern(/^⚠ The (English|Afrikaans) text changed after this was checked\.$/, (_, l) => `⚠ Die ${LANG_ADJ[l]} teks het verander nadat dit nagegaan is.`);
addPattern(/^(English|Afrikaans)$/, (_, l) => LANG_NOUN[l]);
addPattern(/^✨ AI-generated draft\. Read every part carefully — especially maths, names and quiz answers — before verifying\. Quiz answers stay the same: the correct option is taken from the (English|Afrikaans) quiz\.$/,
  (_, l) => `✨ KI-gegenereerde konsep. Lees elke deel noukeurig deur, veral wiskunde, name en vasvra-antwoorde, voordat jy verifieer. Vasvra-antwoorde bly dieselfde: die korrekte opsie kom uit die ${LANG_ADJ[l]} vasvra.`);
addPattern(/^Write or paste the translation\. Quiz answers stay the same: the correct option is taken from the (English|Afrikaans) quiz\.$/,
  (_, l) => `Skryf of plak die vertaling. Vasvra-antwoorde bly dieselfde: die korrekte opsie kom uit die ${LANG_ADJ[l]} vasvra.`);

// Messages and pop-ups that include a name
addPattern(/^Delete "(.*)"\?$/, (_, t) => `Skrap "${t}"?`);
addPattern(/^Delete the (English|Afrikaans) version\?$/, (_, l) => `Skrap die ${LANG_ADJ[l]} weergawe?`);
addPattern(/^Replace the current (English|Afrikaans) version with a new AI translation\? Your edits will be lost\.$/, (_, l) => `Vervang die huidige ${LANG_ADJ[l]} weergawe met 'n nuwe KI-vertaling? Jou wysigings sal verlore gaan.`);
addPattern(/^Reset PIN for (.+)\? The old PIN stops working\.$/, (_, n) => `Herstel PIN vir ${n}? Die ou PIN werk dan nie meer nie.`);
addPattern(/^Deactivate (.+)\? They can no longer log in\.$/, (_, n) => `Deaktiveer ${n}? Hulle kan nie meer inteken nie.`);
addPattern(/^Permanently delete (.+)\? Their quiz history stays\.$/, (_, n) => `Skrap ${n} permanent? Hul vasvra-geskiedenis bly.`);
addPattern(/^Upload failed: (.+)$/, (_, m) => `Oplaai het misluk: ${staffTx(m)}`);
addPattern(/^(.+) is too large \(max (.+)\)\.$/, (_, f, m) => `${f} is te groot (maks. ${m}).`);
addPattern(/^Column "(.+)" is not a known subject and was ignored\.$/, (_, c) => `Kolom "${c}" is nie 'n bekende vak nie en is geïgnoreer.`);

// Import summary lines: "— Name is missing." and "— name → X, grade 5 → 6, subjects"
addPattern(/^— (.+)$/, (_, rest) => {
  const parts = rest.split(', ').map((p) => {
    let m;
    if ((m = p.match(/^name → (.+)$/))) return `naam → ${m[1]}`;
    if ((m = p.match(/^grade (\d+) → (\d+)$/))) return `graad ${m[1]} → ${m[2]}`;
    if (p === 'subjects') return 'vakke';
    return staffTx(p);
  });
  return `— ${parts.join(', ')}`;
});
addPattern(/^You can only manage Grade (\d+)\. This row says Grade (\d+)\.$/, 'Jy kan slegs Graad $1 bestuur. Hierdie ry sê Graad $2.');
addPattern(/^Grade must be a number from 1 to 13( \(found "(.*)"\))?\.$/, (_, __, f) => `Graad moet 'n getal van 1 tot 13 wees${f !== undefined ? ` (gevind: "${f}")` : ''}.`);
addPattern(/^More than one student is called "(.+)" in Grade (\d+)\. Use the Student ID\.$/, (_, n, g) => `Meer as een leerder heet "${n}" in Graad ${g}. Gebruik die Leerder-ID.`);
addPattern(/^"(.+)" appears more than once in the sheet\.$/, '"$1" kom meer as een keer in die blad voor.');
addPattern(/^"(.+)" appears more than once as a new student\.$/, '"$1" kom meer as een keer as nuwe leerder voor.');
