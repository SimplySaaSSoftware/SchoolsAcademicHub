# SchoolsAcademicHub — Project Context

Multi-tenant SaaS LMS built on Azure Static Web Apps (free tier) + Azure Functions v4 (Node.js) + Azure PostgreSQL.

## Live URL
https://polite-island-0106b4103.7.azurestaticapps.net/

## Architecture
- **Frontend**: Vanilla JS, no framework — `frontend/` served by Azure SWA
- **API**: Azure Functions v4 TypeScript — `api/src/functions/`
- **Database**: Azure PostgreSQL (`sspostgreserver.postgres.database.azure.com`) — database `school-academic-hub`
- **Single table**: `items` — all documents stored as JSONB, discriminated by `type` field, partitioned by `school_id`

## URL structure
- `/{slug}` → login page (index.html) — branding loaded from school config
- `/{slug}/student` → student.html
- `/{slug}/teacher` → teacher.html
- `/{slug}/admin` → admin.html
- `/superadmin` → superadmin.html (super admin only)
- `/reset-password?token=X&school=slug` → reset-password.html

## Auth
- Super admin: email + password stored as `SUPER_ADMIN_EMAIL` + `SUPER_ADMIN_PASSWORD_HASH` env vars (bcrypt rounds 12)
- School staff (email mode): email + password stored in DB as `user` type docs
- School staff (pin mode): shared PIN stored as `pin` type docs
- Students: grade PIN / student PIN / student email depending on `student_auth` school config
- JWT: `JWT_SECRET` for school users, `JWT_SECRET_SUPER` for super admin (8h expiry, 24h for students)

## Item types in DB
| type | description |
|---|---|
| `school` | School config (id = slug) |
| `user` | Admin/teacher accounts (email+password auth) |
| `pin` | Shared PIN entries (PIN auth) |
| `post` | Learning content posts |
| `activity` | Student post-opened events (tracking) |
| `quiz_attempt` | Student quiz submissions |
| `reset_token` | Password reset tokens (expires 1h) |
| `subject` | Subject name list per school |
| `term` | Term name list per school |

## Environment variables (Azure Portal → SWA → Environment variables)
| Name | Purpose |
|---|---|
| `PGHOST` | `sspostgreserver.postgres.database.azure.com` |
| `PGPORT` | `5432` |
| `PGDATABASE` | `school-academic-hub` |
| `PGUSER` | `software@simplysaas.co.za` |
| `PGPASSWORD` | DB password |
| `JWT_SECRET` | School user JWT signing key |
| `JWT_SECRET_SUPER` | Super admin JWT signing key |
| `SUPER_ADMIN_EMAIL` | Super admin login email |
| `SUPER_ADMIN_PASSWORD_HASH` | bcrypt hash (rounds 12) of super admin password |
| `RESEND_API_KEY` | Resend API key for transactional emails |
| `RESEND_FROM` | From address for emails |

## GitHub Secrets (for Actions)
| Name | Purpose |
|---|---|
| `AZURE_STATIC_WEB_APPS_API_TOKEN_POLITE_ISLAND_0106B4103` | SWA deployment token (auto-created by Azure) |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | DB credentials for seed workflow |

## Key workflows
- **Deploy**: Auto-deploys on push to `main` via `.github/workflows/azure-static-web-apps-polite-island-0106b4103.yml`
- **Seed DB**: Manual trigger via `.github/workflows/seed-database.yml` — creates schema + first school

## DB helpers (api/src/lib/db.ts)
- `sql` — postgres tagged template literal client
- `insertItem(item)` — INSERT
- `upsertItem(item)` — INSERT … ON CONFLICT UPDATE
- `getItemById(id)` — SELECT by primary key
- `getSchoolBySlug(slug)` — SELECT school by slug
- `updateItemById(id, school_id, type, updates)` — merge-update
- `deleteItemById(id)` — DELETE

## Adding a new school
1. Log in as super admin → `/superadmin`
2. Click "+ New School" — fill in name, slug, branding, auth mode, grades
3. Share `https://polite-island-0106b4103.7.azurestaticapps.net/{slug}` with the school admin

## First-time setup checklist
- [ ] Run "Seed Database" GitHub Action to create schema + HPS school
- [ ] Add `SUPER_ADMIN_EMAIL` to Azure env vars
- [ ] Add `SUPER_ADMIN_PASSWORD_HASH` to Azure env vars (generate with seed or bcrypt)
- [ ] Add DB secrets to GitHub repo secrets (for seed action)
- [ ] Set up Resend domain for branded emails
- [ ] Test login at `/{slug}`
