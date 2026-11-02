# SchoolsAcademicHub — Project Context

Multi-tenant SaaS LMS built on Azure Static Web Apps (free tier) + Azure Functions v4 (Node.js) + Azure PostgreSQL.

## CRITICAL: Mobile-first design
This app is primarily used by **school children and teachers on mobile phones**. Every UI change must be tested mentally at 375px width. Rules:
- Touch targets must be ≥ 44px tall
- No horizontal overflow — tables must scroll, not overflow
- Modals should slide up from the bottom on mobile (≤600px)
- Font sizes must be legible without zooming (≥15px body text)
- Avoid hover-only interactions — all actions must be tappable
- Test every new screen at mobile width before shipping
- Tables: `js/mobile.js` turns every `table.table` into stacked, labelled cards on phones (CSS at the end of `main.css`). Use `<th>` headers on every table; put row actions in a `td.table-actions`
- Quick audit: render each screen at 320px and 375px and check for horizontal overflow, tap targets under 44px and text under 14px

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
- Students: grade PIN / student PIN / student email depending on `student_auth` school config. Individual student PINs: admin → Students tab (add or bulk import). 6-digit PINs are generated and shown once; only a keyed HMAC (`pin_lookup`) is stored, so a lost PIN is reset, not recovered. Students only see posts for their own grade. Class teachers (teacher portal → Students) can list, add, import and reset PINs for their own grade only; edit/deactivate/delete is admin only. UI is shared in `frontend/js/students.js`
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
| `student` | Student profile for individual-PIN login (`name`, `grade`, `pin_lookup`, `active`) |
| `login_fail` | Failed login attempt per IP, used to rate-limit (10 per 10 min) |
| `reset_token` | Password reset tokens (expires 1h) |
| `subject` | Subject name list per school |
| `term` | Term name list per school |

## Languages (English / Afrikaans)
A post has an original `lang` (`en`/`af`, absent = `en`). `translations.{lang}` holds text only (title, content_html, quiz question/option text); grading data (`correct_index`) always comes from the original quiz. A translation is `draft` until a teacher verifies it, and becomes `stale` (hidden from students) when the original text changes. Students only ever see verified, non-stale translations. AI drafts via `POST /posts/{id}/translate` (`api/src/lib/ai-translate.ts`).

## Interface language (English / Afrikaans)
`js/i18n.js` holds all interface text (`STRINGS.en` / `STRINGS.af`). Use `t('key')` in JS and `data-i18n="key"` / `data-i18n-placeholder` in HTML; server error messages go through `tErr()`. One choice (`localStorage hub_lang`) drives the interface AND which version of a post is shown; first visit follows the device language. The EN | AF switch is `mountLangToggle()`. Individual students also save it on their profile (`POST /me/language`, returned at login as `lang`) so it follows them. Covered: login, reset-password, the student portal and the **teacher portal**. Admin and super admin screens are still English only.

**Teacher (staff) screens use a different method**: `js/i18n-staff.js` translates the page *as it is drawn*. A MutationObserver swaps every text node and placeholder/title/aria-label for Afrikaans using `STAFF_AF` (exact English phrase → Afrikaans) and `STAFF_PATTERNS` (text with names/numbers/languages) in `js/i18n-staff-af.js`; switching language swaps text in place, so nothing is redrawn and unsaved work is kept. `confirm/alert/prompt` pop-ups are translated too. Subject names are learned from `/subjects?full=1`. **To translate new teacher text: add the exact English text to `STAFF_AF` (or a pattern).** Missing text just stays English; `staffMissing()` lists gaps. Teacher-written content (`.ql-editor`, `.post-content`, `.tr-orig`, inputs) is never touched; add `translate="no"` to any other element that shows teacher data. Quill's built-in labels are CSS-drawn, so they are translated in `main.css` under `html[lang="af"]`.

## Student Excel sheet and subject enrolment
Students screen → **Export Excel** downloads a workbook: an editable `Students` sheet (Student ID, Name, Grade, one Yes/blank column per subject, plus grey read-only stats), read-only `Quiz results` and `Lessons` sheets, `Subjects` and `Read me`. **Import Excel** (`POST /student-sheet/import`) imports only Name, Grade and the subject columns: rows with a Student ID (or a unique name+grade match) are updated, others created with a new PIN (shown once). A dry run (`?dry=1`) powers the 'Check before saving' screen and any row error blocks the whole import. Teachers are limited to their own grade. Logic is in `lib/student-sheet.ts` (`planImport` is pure) and `functions/students-sheet.ts`.
`StudentDoc.subjects` = enrolment (stored subject names). Empty = every subject for the grade. Enforced for individual students in `posts-list`, `posts-get` and `activity-quiz-attempt`; shared grade PINs are never restricted.

## Subject names
Each subject has an English and an Afrikaans display name (`SubjectDoc.names`), both required when the admin creates it (admin → Subjects; existing subjects show an "Add Afrikaans" button). `name` is the stored key that posts reference and is never renamed. `GET /posts` and `GET /posts/{id}` add `subject_names {en, af}` and the student portal shows the one for the chosen language, falling back to `name`. Plain `GET /subjects` still returns names only; `?full=1` returns objects with both names.

## Student dashboard
Individual students get a progress summary and **To do / Done / All** tabs (default To do), grouped by subject, with the best quiz score and attempt count on each card. `GET /posts` adds `progress` per post for individual students only (opened, attempts, best, last, passed); shared grade PINs get none and see everything. A quiz counts as done when passed (80%+, same pass mark as `activity-quiz-attempt`); a post without a quiz is done once opened.

## Google Drive connection
Super admin page has a **Google Drive** card: status (checked live), **Connect / Reconnect Google Drive**, Disconnect. Connect runs Google's OAuth flow (`functions/google-drive.ts`): `POST /google/connect-url` → Google → `GET /google/callback` (proved by a signed `state`) → the refresh token is stored AES-encrypted in an `items` doc `google-drive-token` (type `setting`, school_id `system`; `lib/secrets.ts`). `lib/drive.ts` reads that first, then falls back to `GOOGLE_REFRESH_TOKEN`. One-time Google setup: add `https://<public-site>/api/google/callback` under the client's Authorised redirect URIs (the card shows the exact value), and keep the OAuth app **In production** (Testing mode tokens expire after 7 days).

## Public site address
Functions run behind a hidden internal host (`…azurewebsites.net`), so the `Host` header is NOT the public address. `lib/site.ts` `publicBase(req, hint)` picks, in order: `SITE_URL` setting, the origin the page reports (`window.location.origin`), `x-ms-original-url` / `Origin` / `Referer`, then Host as a last resort. Used for the Google redirect address (signed into `state` so the callback reuses it) and for password-reset email links.

## Post HTML, videos and safety
Teacher-written HTML is always shown through `safeHtml()` (`js/safe-html.js`): scripts, forms, event-handler attributes, `javascript:` links and `srcdoc` are removed, and the **only** iframe allowed is a YouTube embed (`youtube-nocookie.com/embed/<11-char id>`, optional `?start=`). The editor's video button (`quillInsertYouTube`) accepts any normal YouTube link (watch, youtu.be, shorts, share links with tracking text, `t=1m30s`) and stores the clean embed address. Never render post HTML any other way. Videos are not synced between languages like images are: adding or changing one makes translations out of date until re-checked.

## Translations and images
Images are language-neutral: a translation's images always follow the original (`withSyncedImages`, applied whenever translated text is shown and again when the original is saved). The out-of-date check ignores images (`sourceHash` strips them), so replacing an image keeps a verified translation verified, while any text change or adding/removing an image makes it out of date until a teacher re-checks it.

## Quiz grading
Graded on the server only. Students receive questions and options without `correct_index` (`posts-get`, `posts-list`). `POST /activity/quiz-attempt` takes `{post_id, selections[], lang}`, computes the score from the stored quiz, and returns per-question correct answers only after submitting. Any client-sent score is ignored.

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
| `DRIVE_ROOT_FOLDER_ID` | Google Drive folder that holds uploaded attachments |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client for Drive uploads (`api/src/lib/drive.ts`) |
| `GOOGLE_REFRESH_TOKEN` | Optional, older way. The token is now saved by Super Admin → Google Drive → Connect (encrypted, in the database); this setting is only the fallback |
| `ANTHROPIC_API_KEY` | Claude API key for AI translation (English ⇄ Afrikaans). Without it the Generate button returns a clear error; manual translation still works |
| `ANTHROPIC_MODEL` | Optional. Model for AI translation (default `claude-sonnet-5-5`) |

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
