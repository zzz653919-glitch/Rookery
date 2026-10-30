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

## 7. Tests

```bash
npm test                          # unit + 23 admin API/security integration tests (boots the server on a temp database)
node tests/e2e/admin.mjs          # 74 browser checks: sign-in/out, roles, lesson/puzzle/theme/settings flows, uploads,
                                  # player integration, offline, mobile layout & touch (needs Playwright)
npm run e2e                       # the original player-site e2e (run it against `npm start` for the server variant)
```
