/* calendar.js — School Calendar UI for teacher and student portals */

// ── Shared helpers ────────────────────────────────────────────────────────────
const CalEsc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_NAMES_AF = ['Januarie','Februarie','Maart','April','Mei','Junie','Julie','Augustus','September','Oktober','November','Desember'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_NAMES_AF = ['Son','Maan','Din','Woe','Don','Vry','Sat'];

function calFmtDate(d) { const dt = new Date(d + 'T00:00:00'); return isNaN(dt) ? '' : dt.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }); }
function calFmtRange(start, end) { if (!end || end === start) return calFmtDate(start); return `${calFmtDate(start)} – ${calFmtDate(end)}`; }

// ── Teacher Calendar UI ───────────────────────────────────────────────────────
const CalendarTeacher = (() => {
  let _main, _session, _notify;
  let _events = [];
  let _year, _month;

  function mount(main, session, notify) {
    _main = main; _session = session; _notify = notify;
    const now = new Date();
    _year = now.getFullYear(); _month = now.getMonth();
    loadAndRender();
  }

  async function loadAndRender() {
    _main.innerHTML = '<p class="loading-text">Loading calendar…</p>';
    try { _events = await apiGet(`/calendar-events?school_id=${SCHOOL_SLUG}`); }
    catch (e) { _main.innerHTML = `<p style="color:red;padding:1rem">${CalEsc(e.message)}</p>`; return; }
    render();
  }

  function render() {
    _main.innerHTML = `
      <div class="page-toolbar">
        <h1 class="page-title">Calendar</h1>
        <button id="cal-btn-new" class="btn btn--primary">+ Add Event</button>
      </div>
      <div class="cal-container">
        ${renderCalGrid()}
        ${renderEventList()}
      </div>`;
    document.getElementById('cal-btn-new').addEventListener('click', () => showEventModal(null));
    document.getElementById('cal-prev').addEventListener('click', () => { _month--; if (_month < 0) { _month = 11; _year--; } render(); });
    document.getElementById('cal-next').addEventListener('click', () => { _month++; if (_month > 11) { _month = 0; _year++; } render(); });
    _main.querySelectorAll('[data-action="edit-event"]').forEach((b) => b.addEventListener('click', () => {
      const ev = _events.find((e) => e.id === b.dataset.eid); if (ev) showEventModal(ev);
    }));
    _main.querySelectorAll('[data-action="del-event"]').forEach((b) => b.addEventListener('click', () => deleteEvent(b.dataset.eid)));
  }

  function eventsInMonth(y, m) {
    const start = new Date(y, m, 1); const end = new Date(y, m + 1, 0);
    const sf = `${y}-${String(m+1).padStart(2,'0')}`;
    return _events.filter((ev) => {
      const evStart = ev.start_date.slice(0, 7);
      const evEnd   = (ev.end_date ?? ev.start_date).slice(0, 7);
      return evStart <= sf && evEnd >= sf;
    });
  }

  function renderCalGrid() {
    const days = DAY_NAMES;
    const monthName = MONTH_NAMES[_month];
    const firstDay = new Date(_year, _month, 1).getDay();
    const daysInMonth = new Date(_year, _month + 1, 0).getDate();
    const today = new Date(); const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    let grid = `<div class="cal-wrap">
      <div class="cal-nav">
        <button class="btn btn--ghost btn--sm" id="cal-prev">&larr;</button>
        <span class="cal-nav__label">${monthName} ${_year}</span>
        <button class="btn btn--ghost btn--sm" id="cal-next">&rarr;</button>
      </div>
      <div class="cal-grid">`;
    days.forEach((d) => { grid += `<div class="cal-dow">${d}</div>`; });
    for (let i = 0; i < firstDay; i++) grid += '<div class="cal-day cal-day--empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${_year}-${String(_month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday = dateStr === todayStr;
      const hasEvent = _events.some((ev) => ev.start_date <= dateStr && (ev.end_date ?? ev.start_date) >= dateStr);
      grid += `<div class="cal-day${isToday ? ' cal-day--today' : ''}${hasEvent ? ' cal-day--has-event' : ''}">
        <span class="cal-day__num">${d}</span>
        ${hasEvent ? '<span class="cal-event-dot"></span>' : ''}
      </div>`;
    }
    grid += '</div></div>';
    return grid;
  }

  function renderEventList() {
    if (!_events.length) return '<p class="dash-empty">No events yet. Tap "+ Add Event" to get started.</p>';
    const upcoming = [..._events].sort((a, b) => a.start_date.localeCompare(b.start_date));
    let html = '<div class="cal-event-list">';
    upcoming.forEach((ev) => {
      html += `<div class="cal-event-item">
        <div class="cal-event-item__dates">${CalEsc(calFmtRange(ev.start_date, ev.end_date))}</div>
        <div class="cal-event-item__title">${CalEsc(ev.title)}</div>
        ${ev.title_af ? `<div class="cal-event-item__alt">${CalEsc(ev.title_af)}</div>` : ''}
        ${ev.location ? `<div class="cal-event-item__loc">📍 ${CalEsc(ev.location)}</div>` : ''}
        ${ev.description ? `<div class="cal-event-item__desc">${CalEsc(ev.description)}</div>` : ''}
        <div class="table-actions" style="margin-top:.5rem">
          <button class="btn btn--secondary btn--sm" data-action="edit-event" data-eid="${CalEsc(ev.id)}">Edit</button>
          <button class="btn btn--danger    btn--sm" data-action="del-event"  data-eid="${CalEsc(ev.id)}">Delete</button>
        </div>
      </div>`;
    });
    html += '</div>';
    return html;
  }

  function showEventModal(ev) {
    const isEdit = !!ev;
    const html = `
      <div class="modal-overlay" id="cal-modal">
        <div class="modal modal--bottom">
          <div class="modal__head">
            <h2>${isEdit ? 'Edit Event' : 'New Event'}</h2>
            <button class="modal__close" id="cal-modal-close">×</button>
          </div>
          <div class="modal__body">
            <div class="form-group">
              <label class="form-label">Title (English) *</label>
              <input id="cal-f-title" class="form-control" value="${CalEsc(ev?.title ?? '')}" placeholder="Event name"/>
            </div>
            <div class="form-group">
              <label class="form-label">Title (Afrikaans)</label>
              <input id="cal-f-title-af" class="form-control" value="${CalEsc(ev?.title_af ?? '')}" placeholder="Event naam in Afrikaans"/>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Start Date *</label>
                <input id="cal-f-start" type="date" class="form-control" value="${CalEsc(ev?.start_date ?? '')}"/>
              </div>
              <div class="form-group">
                <label class="form-label">End Date</label>
                <input id="cal-f-end" type="date" class="form-control" value="${CalEsc(ev?.end_date ?? '')}"/>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Location</label>
              <input id="cal-f-location" class="form-control" value="${CalEsc(ev?.location ?? '')}" placeholder="e.g. School Hall"/>
            </div>
            <div class="form-group">
              <label class="form-label">Description (English)</label>
              <textarea id="cal-f-desc" class="form-control" rows="3" placeholder="Event details…">${CalEsc(ev?.description ?? '')}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Description (Afrikaans)</label>
              <textarea id="cal-f-desc-af" class="form-control" rows="3" placeholder="Beskrywing in Afrikaans…">${CalEsc(ev?.description_af ?? '')}</textarea>
            </div>
            <div class="modal__footer">
              <button class="btn btn--ghost" id="cal-modal-cancel">Cancel</button>
              <button class="btn btn--primary" id="cal-modal-save">${isEdit ? 'Update' : 'Create Event'}</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const close = () => document.getElementById('cal-modal')?.remove();
    document.getElementById('cal-modal-close').addEventListener('click', close);
    document.getElementById('cal-modal-cancel').addEventListener('click', close);
    document.getElementById('cal-modal').addEventListener('click', (e) => { if (e.target.id === 'cal-modal') close(); });
    document.getElementById('cal-f-title').focus();

    document.getElementById('cal-modal-save').addEventListener('click', async () => {
      const title      = document.getElementById('cal-f-title').value.trim();
      const title_af   = document.getElementById('cal-f-title-af').value.trim() || undefined;
      const start_date = document.getElementById('cal-f-start').value;
      const end_date   = document.getElementById('cal-f-end').value || undefined;
      const location   = document.getElementById('cal-f-location').value.trim() || undefined;
      const description    = document.getElementById('cal-f-desc').value.trim();
      const description_af = document.getElementById('cal-f-desc-af').value.trim() || undefined;
      if (!title)      { _notify('Title is required.', true); return; }
      if (!start_date) { _notify('Start date is required.', true); return; }
      try {
        if (isEdit) {
          await apiPut(`/calendar-events/${ev.id}`, { title, title_af, start_date, end_date, location, description, description_af });
          _notify('Event updated.');
        } else {
          await apiPost('/calendar-events', { title, title_af, start_date, end_date, location, description, description_af, school_id: SCHOOL_SLUG });
          _notify('Event created.');
        }
        close(); loadAndRender();
      } catch (e) { _notify(e.message, true); }
    });
  }

  async function deleteEvent(id) {
    const ev = _events.find((e) => e.id === id);
    if (!confirm(`Delete event "${ev?.title}"?`)) return;
    try { await apiDelete(`/calendar-events/${id}`); _notify('Event deleted.'); loadAndRender(); }
    catch (e) { _notify(e.message, true); }
  }

  return { mount };
})();

// ── Student Calendar UI ───────────────────────────────────────────────────────
const CalendarStudent = (() => {
  let _year, _month;
  let _events = [];

  async function mount(container, session) {
    container.innerHTML = `<p class="loading-text">${t('loading')}</p>`;
    try { _events = await apiGet(`/calendar-events?school_id=${SCHOOL_SLUG}`); }
    catch (e) { container.innerHTML = `<p class="loading-text" style="color:red">${CalEsc(e.message)}</p>`; return; }
    const now = new Date();
    _year = now.getFullYear(); _month = now.getMonth();
    render(container);
  }

  function render(container) {
    const lang = currentLang();
    const monthNames = lang === 'af' ? MONTH_NAMES_AF : MONTH_NAMES;
    const dayNames   = lang === 'af' ? DAY_NAMES_AF   : DAY_NAMES;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const firstDay = new Date(_year, _month, 1).getDay();
    const daysInMonth = new Date(_year, _month + 1, 0).getDate();

    let html = `
      <div class="cal-wrap">
        <div class="cal-nav">
          <button class="btn btn--ghost btn--sm" id="cal-stu-prev">&larr;</button>
          <span class="cal-nav__label">${monthNames[_month]} ${_year}</span>
          <button class="btn btn--ghost btn--sm" id="cal-stu-next">&rarr;</button>
        </div>
        <div class="cal-grid">`;
    dayNames.forEach((d) => { html += `<div class="cal-dow">${CalEsc(d)}</div>`; });
    for (let i = 0; i < firstDay; i++) html += '<div class="cal-day cal-day--empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${_year}-${String(_month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday = dateStr === todayStr;
      const hasEvent = _events.some((ev) => ev.start_date <= dateStr && (ev.end_date ?? ev.start_date) >= dateStr);
      html += `<div class="cal-day${isToday ? ' cal-day--today' : ''}${hasEvent ? ' cal-day--has-event' : ''}">
        <span class="cal-day__num">${d}</span>
        ${hasEvent ? '<span class="cal-event-dot"></span>' : ''}
      </div>`;
    }
    html += '</div></div>';

    // Upcoming events
    const upcoming = _events.filter((ev) => (ev.end_date ?? ev.start_date) >= todayStr)
      .sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(0, 10);
    if (upcoming.length) {
      html += `<h3 class="cal-upcoming-head" data-i18n="upcomingEvents">${t('upcomingEvents')}</h3><div class="cal-event-list cal-event-list--student">`;
      upcoming.forEach((ev) => {
        const name = (lang === 'af' && ev.title_af) ? ev.title_af : ev.title;
        const desc = (lang === 'af' && ev.description_af) ? ev.description_af : ev.description;
        html += `<div class="cal-event-item">
          <div class="cal-event-item__dates">${CalEsc(calFmtRange(ev.start_date, ev.end_date))}</div>
          <div class="cal-event-item__title">${CalEsc(name)}</div>
          ${ev.location ? `<div class="cal-event-item__loc">📍 ${CalEsc(ev.location)}</div>` : ''}
          ${desc ? `<div class="cal-event-item__desc">${CalEsc(desc)}</div>` : ''}
        </div>`;
      });
      html += '</div>';
    } else {
      html += `<p class="dash-empty" data-i18n="noUpcomingEvents">${t('noUpcomingEvents')}</p>`;
    }

    container.innerHTML = html;
    document.getElementById('cal-stu-prev').addEventListener('click', () => { _month--; if (_month < 0) { _month = 11; _year--; } render(container); });
    document.getElementById('cal-stu-next').addEventListener('click', () => { _month++; if (_month > 11) { _month = 0; _year++; } render(container); });
  }

  return { mount };
})();
