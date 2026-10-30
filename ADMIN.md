# Rookery admin panel

A secure back-office for the chess website: manage lessons, puzzles, board themes and piece sets, chess settings, and see
real platform statistics. It lives at **`/admin/`** and talks to a small Node.js + SQLite backend (`server/`) that is
part of this project. The player site keeps working exactly as before — with or without the backend.

| | |
|---|---|
| **Admin URL** | `http://127.0.0.1:5173/admin/` (same host and port as the site) |
| **Requires** | Node.js **22.13+** (uses the built-in `node:sqlite`; no npm packages, no `npm install`) |
| **Data** | `data/rookery.db` (SQLite), `data/uploads/` (piece images), `data/backups/` — all git-ignored |

## 1. First-time setup

```bash
npm run db:migrate                                  # creates / upgrades the database (safe to repeat)
npm run admin:create -- --username <your-name>      # prompts twice for a password (hidden); creates a superadmin
npm start                                           # serves the site + /admin/ + the API
```

* There is **no default account and no password in the source code**. The first administrator can only be created from a
  terminal on the server (not through the website), so nobody can race you to it.
* Passwords must be ≥ 12 characters, mix three of lower/upper/digit/symbol, and must not contain the username.
* Non-interactive installs: `ROOKERY_ADMIN_PASSWORD='…' npm run admin:create -- --username <name>` or
  `--password-stdin`. The variable is read once and removed from the process environment.
* Other accounts: **Administrators** page (superadmin) or `--role editor|viewer`.
  Forgotten password: `npm run admin:reset-password -- --username <name>`.

`npm start` runs migrations and — on first start only — imports the bundled 29 lessons, 324 puzzles, themes and default
settings into the database so they can be edited. Later edits are never overwritten.

## 2. Migration commands

```bash
npm run db:migrate        # apply pending migrations (each in a transaction; a failure rolls back)
npm run db:backup         # write a consistent snapshot to data/backups/
node server/cli.mjs status           # applied/available migrations, row counts, administrator count
```

* Migrations are plain SQL files in `server/migrations/` (`001_init.sql`, …), tracked in `schema_migrations`.
* **Before any migration touches an existing database, a snapshot is written to `data/backups/…-pre-migration.db`.**
  Destructive admin actions (deleting a lesson/puzzle/theme/piece set, resetting settings) also snapshot first
  (at most one per 10 minutes; the newest 30 are kept). Backups contain password hashes — keep `data/` private.

## 3. What you can manage

| Section | Capabilities |
|---|---|
| **Dashboard** | Published/draft lessons and puzzles, completed games, active learners, most popular lessons, recent activity, browser + server errors, system status (uptime, DB size, migrations, last backup). All numbers come from the database — zero until real visits happen. |
| **Lessons** | Create, edit, delete (type the id to confirm), publish/unpublish, reorder within a level, assign level / skill / difficulty, objectives, description. A step editor builds explanations with diagrams (FEN + arrows/marks), exercises (find the move, play a sequence, click squares, multiple choice, coordinates) and the final quiz; positions can be pasted as FEN, placed piece-by-piece, or recorded by playing moves. **Preview** runs the real lesson player with your unsaved draft (nothing is recorded as progress). |
| **Puzzles** | Add/edit/delete, FEN, solution recorded by playing it on the board, category (tactical theme), level 1–5, hint, explanation, tags. The server validates the position and every move with the same rules library the game uses; mate-in-1/2 categories must end in checkmate; optional engine cross-check; **Test on the board** plays the puzzle. A theme × level matrix shows coverage. |
| **Themes** | Board colour themes and piece sets. Built-in designs are kept; add recoloured sets (light + dark variants) or upload your own 12 images (SVG / PNG / WebP ≤ 200 KB). Live preview on a real board, enable/disable, choose the defaults for new visitors. |
| **Chess settings** | Computer levels (rename / hide; strength is fixed), time controls, puzzle categories, placement-test thresholds, quiz pass ratio, suggested engine level per learning level, default appearance. Everything is validated; safe defaults can be restored. |
| **Users & progress** | See §6. |
| **Audit log** | Every sign-in, failed sign-in and administrative change (secrets are redacted). |
| **Administrators** | Superadmin only: create accounts, roles, disable, reset passwords. |

**Roles** (enforced on the server for every request): `superadmin` (everything), `editor` (content + themes, read settings/audit),
`viewer` (read-only).

**Level recommendations.** The learner's assessed level selects the lessons shown first (in the order set under *Lessons*;
weak skills first). Publishing, unpublishing, deleting, reordering or moving a lesson to another level changes that path the
next time the player site loads; the placement thresholds are adjustable under *Chess settings*.

## 4. Security model

* **Authentication**: scrypt (N=2¹⁵) password hashes with per-password salt; constant-time comparison; unknown users cost the
  same time as wrong passwords and get the same message.
* **Sessions**: random 256-bit token in an `HttpOnly; SameSite=Strict` cookie (`Secure` when behind HTTPS — see below); only the
  SHA-256 hash is stored. 30 minutes idle and 8 hours absolute lifetime (`ROOKERY_SESSION_IDLE_MINUTES`,
  `ROOKERY_SESSION_MAX_MINUTES`). Logout, disabling an account and password changes destroy sessions.
* **CSRF**: every write needs the per-session `X-CSRF-Token` header and a same-origin `Origin`.
* **Authorisation**: each route declares a permission; the server checks it on every call. Nothing in the browser (URL, local
  storage, hidden menu entries) grants anything.
* **Rate limiting**: 5 failed sign-ins per username and 10 per IP in 15 minutes (persisted, survives restarts). A determined
  attacker can therefore lock a *username* for 15 minutes — an accepted trade-off. Public event endpoint: 120 requests/min/IP.
* **Input validation**: all lesson/puzzle/theme/settings input is validated server-side; lesson text is reduced to an allow-list
  of tags; colours must be hex (no CSS injection); unknown fields are rejected, so no setting can switch off legal-move
  generation or game-result validation (they are not configurable at all).
* **Uploads**: the type is detected from the bytes, never from the filename or `Content-Type`. Only SVG (no scripts, event
  handlers, `foreignObject`, external references or DOCTYPE), PNG (≤ 1024 px) and WebP are accepted; files are renamed by the
  server (`wK.svg` …), stored outside the web root and served with `nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`.
* **Headers**: strict CSP on `/admin/` (scripts only from the same origin), `X-Frame-Options`, `Referrer-Policy: no-referrer`.
* **Logging**: request bodies, cookies and passwords are never logged; errors log the message only; the audit log redacts keys
  matching `pass|secret|token|hash|csrf|cookie`.
* **Not served**: `server/`, `data/`, `tests/`, `scripts/`, `.git`, `*.db`, `*.sql` return 404.

Running in production: put it behind HTTPS (reverse proxy) and set
`ROOKERY_SECURE_COOKIES=1`, `HOST=0.0.0.0` (or bind to the proxy), and `ROOKERY_TRUST_PROXY=1` only if the proxy sets
`X-Forwarded-For/Proto` itself. Keep `data/` on persistent, private storage and back it up.

## 5. Files and data models

New: `server/` (`index.mjs` entry, `app.mjs` dispatcher, `security.mjs`, `db.mjs`, `validate.mjs`, `content.mjs`, `seed.mjs`,
`cli.mjs`, `static.mjs`, `defaults.mjs`, `http.mjs`, `config.mjs`, `routes/*`, `migrations/001_init.sql`), `admin/` (SPA,
`preview.html`), `js/content.js`, `js/telemetry.js`, `tests/admin-api.test.mjs`, `tests/e2e/admin.mjs`, `tests/lib/server.mjs`.
Changed (small, backwards-compatible): `js/app.js` (loads optional remote content), `js/ui/pieces.js` + `js/ui/board.js`
(piece sets incl. image sets), `js/views/{play,lesson,settings,puzzles,placement}.js`, `js/placement-score.js`, `js/store.js`,
`js/data/levels.js` (puzzle categories moved here), `sw.js` (never caches `/api` or `/admin`; caches uploaded piece images),
`scripts/gen-precache.mjs`, `scripts/serve.mjs`, `package.json`.

Tables: `roles`, `admins`, `sessions`, `login_attempts`, `lessons`, `puzzles`, `piece_sets`, `board_themes`, `settings`,
`audit_log`, `events` (anonymous usage events), `server_errors`, `schema_migrations`.

## 6. What the player site sends, and what needs more infrastructure

* The player site has **no accounts**: progress, ratings and game history live in each visitor's browser (IndexedDB).
  Therefore the admin panel **cannot list, search, suspend or inspect individual users, show per-user rating history or
  game archives, or review reported content** — and it says so on the *Users & progress* page. Shared user administration needs
  a backend with sign-in (player accounts, password reset, e-mail verification, privacy policy, moderation tools), which is a
  separate project.
* When the site is served by this server, the browser sends **anonymous** events (lesson started/completed, puzzle attempt,
  game finished, placement result, JavaScript errors) with a random per-browser id. No name, e-mail, IP address or progress
  data is stored with them. Players can switch it off under *Settings → Share anonymous usage statistics*; events are deleted
  after 180 days.
* Static hosting (Vercel/Netlify/GitHub Pages) cannot run the backend: the player site works as before with the bundled
  content, but `/admin/` needs a Node host (VPS, Render, Fly.io, Railway, …) with a persistent disk for `data/`. Content
  published through the admin panel reaches only visitors served by that host; when a visitor is offline, the last bundle they
  loaded is used.

## 6b. Languages and translations (English / Uzbek / Russian)

* **Player site and admin panel** are available in English, Uzbek (Latin) and Russian. The language follows the browser the first time and can be changed with the switcher (player: header / settings; admin: top bar and sign-in page). The choice is remembered.
* **Everything bundled** (interface, all lessons, the placement test, puzzle texts) is translated and ships in `js/i18n/` — it works offline and on plain static hosting.
* **Lessons, puzzles and names written in the admin panel** are stored in English (or whatever you type). The server keeps a *translation memory* (`translations` table, migration `002`) and `GET /api/public/content?lang=uz|ru` returns the content with every known translation applied. Texts without a translation are shown as written.
* **Automatic translation (optional, off by default).** When enabled, new or changed texts are translated in the background shortly after every save, and the **Translations** page has *Translate missing texts now*. It needs an external service and therefore a key you provide:

  ```bash
  npm install @anthropic-ai/sdk
  ANTHROPIC_API_KEY=... ROOKERY_TRANSLATE_PROVIDER=anthropic npm start
  ```

  `ROOKERY_TRANSLATE_MODEL` overrides the model (default `claude-haiku-5-5`). The key is read only from the environment. Texts you write are sent to the provider for translation. Replies are accepted only if they keep the same HTML tags and chess notation, and are sanitised like any other lesson text. Without a provider nothing is sent anywhere.
* **Correcting a translation:** *Translations* page → Edit. A hand-edited translation is never overwritten by the automatic one; *Reset* hands the text back to the translator.
* **Tested with a mock provider only.** The automated tests use a deterministic fake translator (`ROOKERY_TRANSLATE_PROVIDER=mock` together with `ROOKERY_ALLOW_MOCK=1`); the real provider has not been run against the live API. Machine translations of lessons should be reviewed by a person who speaks the language.
* Translation sources are plain text tables: `scripts/i18n/ui.rows.txt` (player interface), `scripts/i18n/admin.rows.txt` (admin panel), `scripts/i18n/content.{uz,ru}.txt` (lessons / puzzles). After editing run `node scripts/i18n/build.mjs`, `node scripts/i18n/build-admin.mjs` or `node scripts/i18n/build-content.mjs`.

## 6c. Database: local file or Turso

By default the data lives in `data/rookery.db` (SQLite, nothing to install). To keep it in **Turso** (hosted libSQL) instead — useful on hosts whose disk is wiped on every restart — set two environment variables; the code is the same:

```bash
# one-off, with the Turso CLI (https://docs.turso.tech/cli)
turso db create rookery
turso db show rookery --url          # libsql://rookery-<you>.turso.io
turso db tokens create rookery       # the auth token

# on the machine / host that runs Rookery
npm install                          # installs the optional @libsql/client driver
export TURSO_DATABASE_URL="libsql://rookery-<you>.turso.io"
export TURSO_AUTH_TOKEN="..."
npm run db:migrate                   # creates the tables in Turso
npm run admin:create -- --username <name>
npm start                            # prints "Database: Turso / libSQL"
```

Notes:

* **Turso is only the database.** The admin panel is still a Node server (`npm start`), so it needs a host that runs Node ≥ 22.13 (Render, Railway, Fly.io, a VPS …). Static hosting (GitHub Pages, Netlify static) cannot run it. On such a host also set `HOST=0.0.0.0`, `ROOKERY_SECURE_COOKIES=1` and (behind the host's proxy) `ROOKERY_TRUST_PROXY=1`; `PORT` is read from the environment.
* **Uploaded piece images are stored in the database** (migration `003`), so nothing but the database needs to survive a restart. Images uploaded by an older version are still served from `data/uploads/` if that folder exists.
* **Backups:** with a local file the server writes snapshots to `data/backups/` before migrations and destructive actions. With Turso it does not — use Turso's own branching / point-in-time restore. Keep the token secret; it is only read from the environment.
* **Speed:** every query is a network round trip. The public content bundle is cached in memory per content version, so players are not slowed down; the admin panel is a little slower than with a local file. The very first start imports the bundled lessons and puzzles (a few hundred statements) and can take a few seconds.
* **Tested with** a local libSQL file through the same client library (the whole API test suite passes on both back ends: `ROOKERY_TEST_DB=libsql npm test`). It has **not** been run against a real Turso cloud database, so do a trial run (migrate, create an admin, sign in, save a lesson) before relying on it.
* Foreign-key enforcement (cascade deletes) is on for the local file; hosted Turso follows its own defaults. The code does not depend on it for correctness (sessions are checked against the admin on every request, uploads are deleted explicitly).

## 7. Tests

```bash
npm test                          # unit + admin API/security integration tests (boots the server on a temp database)
ROOKERY_TEST_DB=libsql npm test   # the same suite against the libSQL (Turso) back end, using a local libSQL file
node tests/e2e/admin-i18n.mjs     # admin languages: crawls every page/dialog in uz+ru, translated lessons on the player site
node tests/e2e/admin.mjs          # 74 browser checks: sign-in/out, roles, lesson/puzzle/theme/settings flows, uploads,
                                  # player integration, offline, mobile layout & touch (needs Playwright)
npm run e2e                       # the original player-site e2e (run it against `npm start` for the server variant)
```
