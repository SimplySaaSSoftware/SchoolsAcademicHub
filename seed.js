// Seed via the deployed API — no direct DB connection needed
const https = require('https');

const BASE_URL = process.env.APP_URL.replace(/\/$/, '');
const TOKEN    = process.env.SUPER_ADMIN_TOKEN;

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url  = new URL(`${BASE_URL}/api${path}`);
    const data = body ? JSON.stringify(body) : null;
    const req  = https.request({
      hostname: url.hostname,
      path:     url.pathname,
      method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${TOKEN}`,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const slug   = process.env.SCHOOL_SLUG;
  const grades = process.env.GRADES.split(',').map(Number).filter(Boolean);

  // 1. Init schema
  console.log('Initialising schema...');
  const init = await apiCall('POST', '/admin/init-schema', {});
  console.log('Schema:', init.status, JSON.stringify(init.body));
  if (init.status !== 200) { console.error('Schema init failed'); process.exit(1); }

  // 2. Create school
  console.log(`Creating school "${process.env.SCHOOL_NAME}"...`);
  const school = await apiCall('POST', '/superadmin/schools', {
    slug,
    name:           process.env.SCHOOL_NAME,
    logo_url:       process.env.SCHOOL_LOGO || '',
    primary_colour: process.env.PRIMARY_COLOUR || '#1a56a0',
    auth_mode:      process.env.AUTH_MODE || 'pin',
    student_auth:   process.env.STUDENT_AUTH || 'grade_pin',
    grades,
  });
  console.log('School:', school.status, JSON.stringify(school.body));
  if (school.status === 201) {
    console.log(`\nSchool created! Login at: ${BASE_URL}/${slug}`);
  } else if (school.status === 409 || (school.body?.error || '').includes('already')) {
    console.log('School already exists — skipping.');
  } else {
    console.error('Failed to create school'); process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
