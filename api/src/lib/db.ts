import postgres from 'postgres';

export const sql = postgres({
  host:         process.env.PGHOST     ?? 'sspostgreserver.postgres.database.azure.com',
  port:         Number(process.env.PGPORT ?? 5432),
  database:     process.env.PGDATABASE ?? 'school-academic-hub',
  username:     process.env.PGUSER     ?? 'software@simplysaas.co.za',
  password:     process.env.PGPASSWORD,
  ssl:          'require',
  max:          5,
  idle_timeout: 20,
});

// ---- Schema (run once) ----

export async function ensureSchema(): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS items (
      id         TEXT        NOT NULL PRIMARY KEY,
      school_id  TEXT        NOT NULL,
      type       TEXT        NOT NULL,
      data       JSONB       NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_items_school_type ON items (school_id, type)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_items_type ON items (type)`);
}

// ---- Generic helpers ----

export async function getItemById<T>(id: string): Promise<T | null> {
  const rows = await sql<{ data: T }[]>`SELECT data FROM items WHERE id = ${id} LIMIT 1`;
  return rows[0]?.data ?? null;
}

export async function getSchoolBySlug(slug: string): Promise<any | null> {
  const rows = await sql<{ data: any }[]>`
    SELECT data FROM items WHERE school_id = ${slug} AND type = 'school' LIMIT 1`;
  return rows[0]?.data ?? null;
}

export async function insertItem<T extends { id: string; school_id: string; type: string }>(item: T): Promise<T> {
  await sql`
    INSERT INTO items (id, school_id, type, data)
    VALUES (${item.id}, ${item.school_id}, ${item.type}, ${sql.json(item as any)})`;
  return item;
}

export async function upsertItem<T extends { id: string; school_id: string; type: string }>(item: T): Promise<T> {
  await sql`
    INSERT INTO items (id, school_id, type, data)
    VALUES (${item.id}, ${item.school_id}, ${item.type}, ${sql.json(item as any)})
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
  return item;
}

export async function deleteItemById(id: string): Promise<void> {
  await sql`DELETE FROM items WHERE id = ${id}`;
}

export async function updateItemById<T>(
  id: string,
  school_id: string,
  type: string,
  updates: Partial<T>
): Promise<void> {
  const existing = await getItemById<T>(id);
  if (!existing) throw new Error(`Item ${id} not found`);
  const merged = { ...existing, ...updates };
  await upsertItem(merged as any);
}
