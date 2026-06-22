// One-time database seed script — run via GitHub Action
const postgres = require('postgres');

const sql = postgres({
  host:     process.env.PGHOST,
  port:     Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  username: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl:      'require',
  max:      1,
});

async function main() {
  console.log('Creating schema...');
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
  console.log('Schema ready.');

  const slug   = process.env.SCHOOL_SLUG;
  const grades = process.env.GRADES.split(',').map(Number).filter(Boolean);

  // Check if school already exists
  const existing = await sql`SELECT id FROM items WHERE id = ${slug} AND type = 'school'`;
  if (existing.length) {
    console.log(`School "${slug}" already exists — skipping.`);
  } else {
    const now  = new Date().toISOString();
    const doc  = {
      id:             slug,
      school_id:      slug,
      type:           'school',
      slug,
      name:           process.env.SCHOOL_NAME,
      logo_url:       process.env.SCHOOL_LOGO || '',
      primary_colour: process.env.PRIMARY_COLOUR || '#1a56a0',
      auth_mode:      process.env.AUTH_MODE || 'pin',
      student_auth:   process.env.STUDENT_AUTH || 'grade_pin',
      grades,
      active:         true,
      created_at:     now,
    };

    await sql`
      INSERT INTO items (id, school_id, type, data)
      VALUES (${doc.id}, ${doc.school_id}, ${doc.type}, ${sql.json(doc)})`;
    console.log(`School "${doc.name}" created at /${slug}`);
  }

  console.log('\nDone! Next steps:');
  console.log('1. Add SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD_HASH to Azure env vars');
  console.log('2. Visit the login page to test');

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
