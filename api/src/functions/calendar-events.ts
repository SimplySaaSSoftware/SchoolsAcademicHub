import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, insertItem, upsertItem, deleteItemById } from '../lib/db';
import { requireAuth, requireRole, errorResponse, HttpError, effectiveSchoolId } from '../lib/middleware';
import { CalendarEventDoc } from '../types';
import { randomUUID } from 'crypto';

// GET    /calendar-events?school_id=&from=&to=  — list events (all authenticated users)
// GET    /calendar-events/:id
// POST   /calendar-events (admin/teacher)
// PUT    /calendar-events/:id (admin/teacher)
// DELETE /calendar-events/:id (admin only)

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);

    if (req.method === 'GET' && !req.params.id) {
      const schoolId = req.query.get('school_id') ?? jwt.school_id;
      const from = req.query.get('from');
      const to   = req.query.get('to');

      let rows: { data: CalendarEventDoc }[];
      if (from && to) {
        rows = await sql<{ data: CalendarEventDoc }[]>`
          SELECT data FROM items
          WHERE school_id = ${schoolId} AND type = 'calendar_event'
            AND (data->>'start_date' <= ${to})
            AND (COALESCE(data->>'end_date', data->>'start_date') >= ${from})
          ORDER BY data->>'start_date' ASC`;
      } else if (from) {
        rows = await sql<{ data: CalendarEventDoc }[]>`
          SELECT data FROM items
          WHERE school_id = ${schoolId} AND type = 'calendar_event'
            AND COALESCE(data->>'end_date', data->>'start_date') >= ${from}
          ORDER BY data->>'start_date' ASC`;
      } else {
        rows = await sql<{ data: CalendarEventDoc }[]>`
          SELECT data FROM items
          WHERE school_id = ${schoolId} AND type = 'calendar_event'
          ORDER BY data->>'start_date' ASC`;
      }
      return { jsonBody: rows.map((r) => r.data) };
    }

    if (req.method === 'GET' && req.params.id) {
      const id = req.params.id;
      const rows = await sql<{ data: CalendarEventDoc }[]>`SELECT data FROM items WHERE id = ${id} AND type = 'calendar_event'`;
      if (!rows.length) throw new HttpError(404, 'Event not found');
      const ev = rows[0].data;
      if (ev.school_id !== jwt.school_id && jwt.role !== 'super_admin') throw new HttpError(403, 'Forbidden');
      return { jsonBody: ev };
    }

    requireRole(jwt, ['teacher', 'admin', 'super_admin']);
    const schoolId = effectiveSchoolId(req, jwt);

    if (req.method === 'POST') {
      const body = await req.json() as Partial<CalendarEventDoc>;
      if (!body.title?.trim())      throw new HttpError(400, 'title is required');
      if (!body.start_date?.trim()) throw new HttpError(400, 'start_date is required');
      const now = new Date().toISOString();
      const ev: CalendarEventDoc = {
        id:               randomUUID(),
        school_id:        schoolId,
        type:             'calendar_event',
        title:            body.title.trim(),
        title_af:         body.title_af?.trim() || undefined,
        description:      body.description ?? '',
        description_af:   body.description_af?.trim() || undefined,
        location:         body.location?.trim() || undefined,
        start_date:       body.start_date.trim(),
        end_date:         body.end_date?.trim() || undefined,
        created_by_id:    jwt.user_id,
        created_by_name:  jwt.name ?? jwt.user_id,
        created_at:       now,
        updated_at:       now,
      };
      return { status: 201, jsonBody: await insertItem(ev) };
    }

    if (req.method === 'PUT') {
      const id = req.params.id;
      if (!id) throw new HttpError(400, 'id required');
      const rows = await sql<{ data: CalendarEventDoc }[]>`SELECT data FROM items WHERE id = ${id} AND school_id = ${schoolId} AND type = 'calendar_event'`;
      if (!rows.length) throw new HttpError(404, 'Event not found');
      const existing = rows[0].data;
      const body = await req.json() as Partial<CalendarEventDoc>;
      const now = new Date().toISOString();
      const updated: CalendarEventDoc = {
        ...existing,
        title:          body.title?.trim() ?? existing.title,
        title_af:       body.title_af !== undefined ? (body.title_af?.trim() || undefined) : existing.title_af,
        description:    body.description !== undefined ? body.description : existing.description,
        description_af: body.description_af !== undefined ? (body.description_af?.trim() || undefined) : existing.description_af,
        location:       body.location !== undefined ? (body.location?.trim() || undefined) : existing.location,
        start_date:     body.start_date?.trim() ?? existing.start_date,
        end_date:       body.end_date !== undefined ? (body.end_date?.trim() || undefined) : existing.end_date,
        updated_at:     now,
      };
      return { jsonBody: await upsertItem(updated) };
    }

    if (req.method === 'DELETE') {
      requireRole(jwt, ['admin', 'super_admin']);
      const id = req.params.id;
      const rows = await sql<{ data: CalendarEventDoc }[]>`SELECT data FROM items WHERE id = ${id} AND school_id = ${schoolId} AND type = 'calendar_event'`;
      if (!rows.length) throw new HttpError(404, 'Event not found');
      await deleteItemById(id);
      return { status: 204, body: null };
    }

    throw new HttpError(405, 'Method not allowed');
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('calendar-events-list',   { methods: ['GET'],    authLevel: 'anonymous', route: 'calendar-events',      handler });
app.http('calendar-events-get',    { methods: ['GET'],    authLevel: 'anonymous', route: 'calendar-events/{id}', handler });
app.http('calendar-events-create', { methods: ['POST'],   authLevel: 'anonymous', route: 'calendar-events',      handler });
app.http('calendar-events-update', { methods: ['PUT'],    authLevel: 'anonymous', route: 'calendar-events/{id}', handler });
app.http('calendar-events-delete', { methods: ['DELETE'], authLevel: 'anonymous', route: 'calendar-events/{id}', handler });
