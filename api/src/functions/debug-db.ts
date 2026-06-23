import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { sql, ensureSchema } from '../lib/db';

async function handler(req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  const dbVars = {
    PGHOST:     process.env.PGHOST     ?? '(not set)',
    PGPORT:     process.env.PGPORT     ?? '(not set)',
    PGDATABASE: process.env.PGDATABASE ?? '(not set)',
    PGUSER:     process.env.PGUSER     ?? '(not set)',
    PGPASSWORD: process.env.PGPASSWORD ? '(set)' : '(not set)',
  };

  try {
    const rows = await sql`SELECT current_database() AS db, now() AS ts`;
    if (req.method === 'POST') {
      await ensureSchema();
      return { jsonBody: { ok: true, action: 'schema initialised', db: rows[0], dbVars } };
    }
    return { jsonBody: { ok: true, db: rows[0], dbVars } };
  } catch (err: any) {
    return { status: 500, jsonBody: { ok: false, error: err.message, dbVars } };
  }
}

app.http('debug-db', { methods: ['GET', 'POST'], authLevel: 'anonymous', route: 'debug/db', handler });
