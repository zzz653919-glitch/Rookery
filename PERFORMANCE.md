# Rookery performance audit

Measured with `node tests/perf/perf.mjs out.json` (Playwright + Chromium over CDP, CPU throttled 4x, ~1.6 Mbit / 120 ms latency, the real server with a mocked upstream, 40 live boards). Numbers are local; they are **not** measurements of the production Vercel + Turso deployment, where every database statement is also a network round trip (so the query-count reductions matter even more there).

## Actual causes found

| # | Cause | Evidence | Fix |
|---|---|---|---|
| 1 | The live page (Chess World → Live) ran at ~100 % CPU: three infinite `box-shadow` animations (repaint every frame), and a `pulse` keyframe name collision with the board-hint animation | 29.9 s of main-thread time in a 30 s window; disabling animations removed it | opacity-only `wblink` animation (`css/world.css`); `content-visibility:auto` on cards/rows below the fold; lighter blur on mobile bars (`css/fusion.css`) |
| 2 | N+1 database queries: `playerInfo` per game side, tournament counts per row, per-event status/podium, FIDE lookups one by one | own profile 43 statements, tournaments list 35, world home 21 sequential, world players 10 | batched `IN` queries and joins (`server/games.mjs`, `routes/community.mjs`, `world.mjs`); status computed in SQL; podiums/FIDE in one go |
| 3 | The home page made 6 API calls (some duplicated) | 10 API calls on a signed-in home load | single public `GET /api/home` (`server/routes/home.mjs`), 15 s memory cache; home now makes 5 calls total |
| 4 | Endpoints waited on slow upstreams (Lichess, FIDE, Wikipedia) | world home blocked on refresh | refresh waits at most 1.5 s, stored data is served; imports run in the background; 45 s cache |
| 5 | No shared caching on public GET endpoints; uncompressed JSON on the Node host | every request hit the function and DB | `s-maxage` / `stale-while-revalidate` headers for public endpoints (Vercel CDN), gzip for JSON > 1.4 KB on Node, facets memoized |
| 6 | Missing indexes | table scans on lists/joins | `server/migrations/008_perf.sql` |
| 7 | 1.8 MB of Inter fonts preloaded and precached though the player site uses Manrope | first visit 1156 KB | removed from player CSS/preload/precache (admin keeps them) |
| 8 | ES-module waterfall (5 levels, 29 files) | slow first paint on high latency | generated `modulepreload` hints in `index.html` (`scripts/gen-precache.mjs`) |
| 9 | Boot did sequential work; engine worker started eagerly; service-worker install (100 files) competed with the first screen | | store + session load in parallel; probe request skipped once the server was seen; engine starts on demand; SW registers when idle (≤ 2 s) |
| 10 | Polling hygiene: Watch page polled every 8 s even in a hidden tab, repainted unchanged lists, two sequential requests; notification badge polled in hidden tabs; WebSocket retried on hosts without support | | hidden-tab guards, change detection, parallel requests, 24 h "no WebSocket" memory (`js/realtime.js`) |

## Before → after (same harness, same machine)

| Scenario | Before | After |
|---|---|---|
| First visit, time to ready | 6702 ms | 4538 ms |
| First visit, transferred | 1156 KB | 657 KB |
| First visit, CPU | 1229 ms | 781 ms |
| Signed-in home | 1709 ms, 10 API calls, 491 ms long tasks | 1273 ms, 5 API calls, 101 ms long tasks |
| Signed-in home CPU | 1256 ms | 543 ms |
| Live page, 30 s of polling (CPU) | 29 924 ms | 3 655 ms (−88 %) |
| World LIVE (40 boards) | 821 ms | 433 ms |
| World results (30 games) long tasks | 155 ms | 0 ms |
| Server RSS | 115 MB | 112 MB |

Other routes (learn, puzzles, play hub, openings, leaderboard, profile, world pages, admin) are unchanged within noise. The computer opponent replies in ~520 ms (level 3) and runs in a Web Worker, so it never blocks the UI.

Database statements per request on the server side (after): own profile 5 (was 43), tournaments list 16 (was 35), world facets 0 (was 4, memoized); `/api/world/home` stays at ~22 statements but they now run in parallel and the page is cached 45 s, so its wall time no longer adds up; API p50 is 0.4–2 ms locally, `world live (40 boards)` 12 ms.

## Not changed on purpose

* The piece set stays inline SVG per piece: its themes rely on CSS variables inside each SVG, so a shared `<use>` sprite would break them.
* `js/data/lessons.js` / `puzzles.js` (116 KB) are still imported statically; making them lazy is a larger refactor with small measured benefit.

## Tests

* `npm test` 160 tests pass in file mode and in `ROOKERY_TEST_DB=libsql` mode (new test for `/api/home`).
* E2E (Playwright): static host 85/85, world 68/68, platform 59/59, admin 75/75.
