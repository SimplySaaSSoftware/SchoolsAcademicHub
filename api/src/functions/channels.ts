import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, insertItem, upsertItem, deleteItemById } from '../lib/db';
import { requireAuth, requireRole, errorResponse, HttpError, effectiveSchoolId } from '../lib/middleware';
import { ChannelDoc } from '../types';
import { randomUUID } from 'crypto';

// GET /channels?school_id=  — list all channels for a school (all authenticated users)
// POST /channels            — create channel (admin/teacher)
// PUT /channels/:id         — update channel (admin/teacher)
// DELETE /channels/:id      — delete channel + its posts (admin only)

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);

    if (req.method === 'GET') {
      const schoolId = req.query.get('school_id') ?? jwt.school_id;
      const rows = await sql<{ data: ChannelDoc }[]>`
        SELECT data FROM items
        WHERE school_id = ${schoolId} AND type = 'channel'
        ORDER BY (data->>'order')::int ASC, created_at ASC`;
      return { jsonBody: rows.map((r) => r.data) };
    }

    requireRole(jwt, ['teacher', 'admin', 'super_admin']);
    const schoolId = effectiveSchoolId(req, jwt);

    if (req.method === 'POST') {
      const body = await req.json() as Partial<ChannelDoc>;
      if (!body.name?.trim()) throw new HttpError(400, 'name is required');

      const existing = await sql<{ data: ChannelDoc }[]>`
        SELECT data FROM items WHERE school_id = ${schoolId} AND type = 'channel'`;
      const order = existing.length;

      const channel: ChannelDoc = {
        id:               randomUUID(),
        school_id:        schoolId,
        type:             'channel',
        name:             body.name.trim(),
        name_af:          body.name_af?.trim() || undefined,
        parent_id:        body.parent_id ?? null,
        order,
        created_by_id:    jwt.user_id,
        created_by_name:  jwt.name ?? jwt.user_id,
        created_at:       new Date().toISOString(),
      };
      return { status: 201, jsonBody: await insertItem(channel) };
    }

    if (req.method === 'PUT') {
      const id = req.params.id;
      const rows = await sql<{ data: ChannelDoc }[]>`SELECT data FROM items WHERE id = ${id} AND school_id = ${schoolId} AND type = 'channel'`;
      if (!rows.length) throw new HttpError(404, 'Channel not found');
      const existing = rows[0].data;
      const body = await req.json() as Partial<ChannelDoc>;
      const updated: ChannelDoc = {
        ...existing,
        name:     body.name?.trim() ?? existing.name,
        name_af:  body.name_af !== undefined ? (body.name_af?.trim() || undefined) : existing.name_af,
        order:    body.order !== undefined ? Number(body.order) : existing.order,
        parent_id: body.parent_id !== undefined ? body.parent_id : existing.parent_id,
      };
      return { jsonBody: await upsertItem(updated) };
    }

    if (req.method === 'DELETE') {
      requireRole(jwt, ['admin', 'super_admin']);
      const id = req.params.id;
      const rows = await sql<{ data: ChannelDoc }[]>`SELECT data FROM items WHERE id = ${id} AND school_id = ${schoolId} AND type = 'channel'`;
      if (!rows.length) throw new HttpError(404, 'Channel not found');
      // Also delete all channel posts in this channel (and sub-channels)
      const channelIds = [id];
      // Find sub-channels
      const subs = await sql<{ data: ChannelDoc }[]>`SELECT data FROM items WHERE school_id = ${schoolId} AND type = 'channel' AND data->>'parent_id' = ${id}`;
      subs.forEach((s) => channelIds.push(s.data.id));
      for (const cid of channelIds) {
        await sql`DELETE FROM items WHERE school_id = ${schoolId} AND type = 'channel_post' AND data->>'channel_id' = ${cid}`;
      }
      await sql`DELETE FROM items WHERE school_id = ${schoolId} AND type = 'channel' AND data->>'parent_id' = ${id}`;
      await deleteItemById(id);
      return { status: 204, body: null };
    }

    throw new HttpError(405, 'Method not allowed');
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('channels-list',   { methods: ['GET'],    authLevel: 'anonymous', route: 'channels',      handler });
app.http('channels-create', { methods: ['POST'],   authLevel: 'anonymous', route: 'channels',      handler });
app.http('channels-update', { methods: ['PUT'],    authLevel: 'anonymous', route: 'channels/{id}', handler });
app.http('channels-delete', { methods: ['DELETE'], authLevel: 'anonymous', route: 'channels/{id}', handler });
