# Rookery — a chess platform

Rookery is a complete chess website: **play rated games online** against real people (matchmaking, private room links, spectating,
tournaments), **play Stockfish 19** at eight strengths, **learn** with lessons, puzzles, an opening explorer and an endgame trainer,
and **review games** with an analysis board. It speaks **English, Uzbek and Russian**, has dark and light themes, works on phones,
and keeps working offline for everything that does not need other people.

It has two parts that work together:

* the **player site** — a static ES-module app (no build step) with a service worker for offline use;
* the **Node server** (`server/`) — accounts, online games over WebSockets, ratings, community features and the **admin panel**
  (`/admin`). Data lives in SQLite (a local file) or in **Turso**. See [ADMIN.md](ADMIN.md).

Without the server (plain static hosting) the site still works as a single-player academy: lessons, puzzles, Stockfish, local
two-player, openings, endgames and analysis. Accounts, online games, friends, tournaments, news and leaderboards need the server.

## Launch

```bash
cd rookery
npm start                     # → http://127.0.0.1:5173       (site, API, WebSockets, /admin)
npm run admin:create -- --username <name>      # first administrator (prompts for the password)
```

Node 22.13 or newer. `npm install` is only needed for the optional Turso driver (`@libsql/client`). Static-only mode: `npm run start:static`.

## What is inside

| Area | What you get |
| --- | --- |
| **Play** | Online quick pairing (bullet / blitz / rapid / classical, rated or casual), private room by link, challenge a friend, play the computer (Stockfish 19, 8 levels), two players on one device. |
| **Game page** | Drag-and-drop and click-to-move, legal-move highlights, premium piece sets, clocks with increment, move list with review, captured pieces, draw offers, resign, rematch, chat, PGN copy/download, report a player. Castling, en passant, promotion, check/mate/stalemate, repetition, fifty-move rule. |
| **Online** | The server validates every move and keeps the clocks. WebSocket push when the host supports it, automatic HTTP polling when it does not (e.g. Vercel). Spectators watch live. |
| **Ratings** | Elo per time control (bullet, blitz, rapid, classical) and for puzzles; leaderboards; provisional ratings for new players. |
| **Profile** | Avatar (presets or upload), country, bio, ratings, statistics, game history, favourite openings, achievements, learning progress synced to the account. |
| **Community** | Friends and friend requests, presence, challenges, arena **tournaments** (admin-scheduled), **news**, **reports and moderation**. |
| **Learn** | 29 lessons, placement test, 288 puzzles with a daily puzzle and puzzle rating, **opening explorer and trainer** (90+ verified lines), **endgame trainer** (11 positions checked with Stockfish), **analysis board** (import PGN, Stockfish evaluation, blunder markers, evaluation graph). |
| **Admin panel** | Lessons, puzzles, themes and piece images, settings, translations (automatic + manual), players (ban, mute, reset password), reports, news, tournaments, statistics, audit log, administrator accounts and roles. |
| **Chess World** | News from official sources (each item shows its source and date), a tournament calendar (live / upcoming / completed, countdowns, provisional vs. confirmed schedules), a searchable archive of games with replay, evaluation graph and PGN download, **live games** of official broadcasts, embedded official **video broadcasts**, grandmaster profiles with FIDE ratings, and global search. See "Chess World" below. |
| **Languages** | English, Uzbek (Latin), Russian — interface, lessons, placement test, puzzles, admin panel; custom content can be auto-translated. |

## Chess World

A media centre inside Rookery (`#/world`). Nothing in it is invented: every value comes from an upstream response or from an administrator, and every item names its source.

| Data | Where it comes from |
| --- | --- |
| Tournaments, schedules, rounds, **games, live moves, clocks, engine evaluations** | The public **Lichess broadcast API** (`/api/broadcast/…`), which carries official tournaments (FIDE events, national championships, leagues) |
| Ratings, titles, birth year, photos of grandmasters | The FIDE ratings database as served by Lichess (`/api/fide/player/<id>`); the name is checked against the stored name so a wrong id never shows another person's data |
| Biographies | Wikipedia's REST summary (shown with the source link); editors can write their own, per language |
| News | RSS / Atom feeds of the sources an administrator switches on (the Lichess blog is on by default; FIDE and Chess.com entries are listed **off** until someone verifies them) plus articles written in the admin panel |
| Video broadcasts | Official YouTube (channel live stream or video), Twitch or link entries added by editors — never guessed |
| Prize, registration, world ranking, achievements | Only what an editor enters (a ranking needs the official list it comes from) |

Behaviour worth knowing:

* **Caching and failures.** Upstream answers are cached in the database (events 2 min, rating lookups 6 h, Wikipedia 24 h, live rounds 6 s). If an upstream fails, the last stored answer is served, marked stale, and pages show a clear message — never made-up data.
* **Games are stored when needed** (a tournament page is opened, the home page bootstraps the latest finished events, a live round is polled), a few rounds per request, so the archive grows by itself. Administrators can import more (`Refresh data now`, `Import games`).
* **Live games** poll the broadcast feed every ~6 s (a few seconds of cache on the server). Clocks show the time left after each side's last move, as published.
* **Corrections.** An administrator can correct any tournament, game, source, player or broadcast; corrected records are kept when the feed updates and every change is written to a history (`History` button, and the audit log).
* Not available: per-player country in the games archive (broadcast PGNs do not carry it — the *country filter means the country where the tournament was played*), official FIDE news and Chess.com feeds are not enabled until verified, and there is no ranking list unless an editor supplies one.

## Technology

* **Rules engine** `js/chess/rules.js` (0x88, perft-tested) — shared by the browser and the server, so both always agree on legality.
* **Stockfish 19** (lite, single-threaded WebAssembly) in `engine/stockfish/`, run in a Web Worker and driven over UCI. License: **GPL-3.0**, see `engine/stockfish/NOTICE.md`. The small built-in alpha-beta engine (`js/chess/engine.js`) is the fallback and can be chosen in Settings.
* **Server** — zero-dependency Node: own HTTP routing, scrypt password hashing, HttpOnly SameSite=Strict sessions with CSRF tokens and Origin checks, persistent login throttling, role-based admin permissions, audit log. A minimal RFC 6455 WebSocket server (`server/realtime.mjs`) with Origin checks.
* **Database** — SQLite via `node:sqlite`, or Turso/libSQL (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`). Versioned migrations.
* **Front-end** — plain ES modules, template-literal views, hash router, IndexedDB store, service worker precache.

## Honest notes

* **Hosting and WebSockets.** WebSockets need a long-running server (`npm start` on a VPS, Render, Railway, Fly.io …). On serverless hosts such as Vercel the API runs as a function, WebSockets are not available, and the site falls back to polling every ~1.2 s — games still work, updates are a little less instant. Clocks are timestamps on the server, so this is fair.
* **Chess World needs the internet.** The server fetches data from Lichess, FIDE (via Lichess) and Wikipedia; behind a restrictive firewall allow `lichess.org` and `*.wikipedia.org`. Set `ROOKERY_WORLD_OFFLINE=1` to switch the live data off. Images of news items and events are loaded by the visitor's browser from the publishers' own servers.
* **No e-mail.** Accounts are username + password. There is no e-mail verification and no password reset by e-mail (an administrator can reset a password).
* **Rating pools are small.** Matchmaking can only pair people who are searching at the same time; with few players the search range keeps widening and you can play the computer meanwhile.
* **Stockfish licence.** Stockfish is GPL-3.0. Keep `engine/stockfish/NOTICE.md` and the licence text when you redistribute the site.
* **Anti-cheating is minimal.** There are reports and moderation, but no engine-detection system.
* Automatic translation of custom lessons needs an external provider and key (see ADMIN.md §6b); it was tested with a mock provider only. Translations of custom content should be reviewed by a speaker.
* The placement result is an estimate, puzzles are machine-generated and verified, and levels of the computer are relative strengths (Stockfish `UCI_Elo`/skill settings), not calibrated ratings.

## Project layout

```
index.html, manifest.webmanifest, sw.js, precache.json   app shell, PWA, offline cache list
css/styles.css, css/platform.css                         design system and the platform layer (themes, responsive)
js/app.js                                                shell, hash router, navigation, session bootstrap
js/net.js, js/realtime.js, js/sync.js, js/auth-ui.js     API client + session, WebSocket/polling, progress sync, sign-in dialog
js/chess/rules.js, engine.js                             rules (shared with the server) and the built-in engine
js/stockfish-client.js, js/engine-client.js              Stockfish worker + fallback
js/views/                                                home, play-hub, online, game, play (computer), local, watch, leaderboard, friends,
                                                         news, tournaments, profile, openings, endgames, analysis, learn, lesson, puzzles, settings …
js/data/                                                 lessons, placement, puzzles, openings, endgames
js/i18n/                                                 core, runtime, dictionaries (uz/ru)
engine/stockfish/                                        Stockfish 19 lite WASM + notice
server/                                                  app, routes (users, games, community, admin), games, rating, realtime, db, migrations
admin/                                                   the admin panel (SPA)
api/index.mjs, vercel.json                               Vercel serverless entry
scripts/                                                 serve, precache, puzzle generators, i18n tools
tests/                                                   unit + API tests (node --test) and browser e2e (tests/e2e)
```

## Tests

```bash
npm test                              # rules (perft), engine, content, i18n, accounts, online games over HTTP + WebSocket,
                                      # community, admin API/security, openings, endgames, database layer, Vercel handler
ROOKERY_TEST_DB=libsql npm test       # the same suite on the Turso/libSQL back end (local libSQL file)

# browser tests (need Playwright + Chromium):
node tests/e2e/platform.mjs           # accounts, matchmaking, two players on one game (WebSocket and polling), spectators,
                                      # private rooms, Stockfish, learning center, ru/uz, phone layout, admin views
node tests/e2e/admin.mjs              # admin panel flows
node tests/e2e/world.mjs              # Chess World pages, languages, phone layout and admin pages against a mock of the upstream services
node tests/e2e/admin-i18n.mjs         # every admin page and dialog in uz and ru, translated lessons on the player site
npm run start:static & node tests/e2e/run.mjs http://127.0.0.1:5173   # the original player-site suite (offline included)
```

## Deploying

* **Anywhere Node runs** (VPS, Render, Railway, Fly.io): `npm start` with `HOST=0.0.0.0`, `ROOKERY_SECURE_COOKIES=1`, `ROOKERY_TRUST_PROXY=1`; give it a persistent disk for SQLite or use Turso.
* **Vercel**: static site + `api/index.mjs` function with Turso — see ADMIN.md §6d.
* **Static only** (GitHub Pages, Netlify): see DEPLOY.md — single-player features only.

## Licence

MIT for the code. Inter font: SIL Open Font License 1.1 (`fonts/LICENSE-Inter.txt`). Stockfish: GPL-3.0 (`engine/stockfish/`).
