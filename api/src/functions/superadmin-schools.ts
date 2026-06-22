import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { queryItems, createItem, updateItem } from '../lib/cosmos';
import { requireAuth, requireRole, errorResponse, HttpError } from '../lib/middleware';
import { SchoolDoc } from '../types';
import { randomUUID } from 'crypto';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const jwt = requireAuth(req);
    requireRole(jwt, ['super_admin']);

    if (req.method === 'GET') {
      const schools = await queryItems<SchoolDoc>({
        query: 'SELECT * FROM c WHERE c.type = @type ORDER BY c.name ASC',
        parameters: [{ name: '@type', value: 'school' }],
      });
      return { jsonBody: schools };
    }

    if (req.method === 'POST') {
      const body = await req.json() as Partial<SchoolDoc>;
      if (!body.slug || !body.name) throw new HttpError(400, 'slug and name required');

      const slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const doc: SchoolDoc = {
        id:              slug,
        school_id:       slug,
        type:            'school',
        slug,
        name:            body.name,
        logo_url:        body.logo_url        ?? '',
        primary_colour:  body.primary_colour  ?? '#1a56a0',
        auth_mode:       body.auth_mode       ?? 'pin',
        student_auth:    body.student_auth    ?? 'grade_pin',
        grades:          body.grades          ?? [1,2,3,4,5,6,7],
        active:          true,
        created_at:      new Date().toISOString(),
      };
      await createItem(doc);
      return { status: 201, jsonBody: doc };
    }

    if (req.method === 'PUT') {
      const id   = req.params.id;
      const body = await req.json() as Partial<SchoolDoc>;
      await updateItem(id, id, body);
      return { jsonBody: { ok: true } };
    }

    return { status: 405 };
  } catch (err) {
    return errorResponse(err);
  }
}

app.http('superadmin-schools',      { methods: ['GET', 'POST'], authLevel: 'anonymous', route: 'superadmin/schools',       handler });
app.http('superadmin-schools-by-id', { methods: ['PUT'],         authLevel: 'anonymous', route: 'superadmin/schools/{id}',  handler });
