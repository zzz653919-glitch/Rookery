# Putting Rookery on the internet

Rookery is plain static files: no build step, no server code. Any static host works. HTTPS is required for the
service worker (offline mode) and "install as app" — every host below gives you HTTPS automatically.

**Before every deploy** refresh the offline file list:

```bash
npm run precache      # rewrites precache.json (also done automatically by `npm start`)
```

## Option 1 — Vercel (drag & drop, no account setup needed beyond sign-in)

1. Install the CLI once: `npm i -g vercel` (or use the web dashboard "Add New → Project → upload").
2. In the project folder run `vercel` and answer: *Framework preset* → **Other**, *Build command* → leave empty,
   *Output directory* → `.` (the folder itself).
3. `vercel --prod` publishes it. `vercel.json` (included) makes sure `sw.js`, `precache.json` and HTML are never
   cached stale, so updates reach users.

## Option 2 — Netlify

Drag the whole `rookery` folder onto https://app.netlify.com/drop . No settings needed.
(Optional: add a `_headers` file with `/sw.js` → `Cache-Control: no-cache`.)

## Option 3 — GitHub Pages

1. Create a repository and upload the project files (not `scripts/out`, which is only generator scratch data).
2. Settings → Pages → *Deploy from a branch* → `main` / root.
3. The site is served from `https://<user>.github.io/<repo>/`. Rookery uses relative paths, so a sub-folder works.

## After deploying

* Open the site, wait a few seconds, then switch off Wi-Fi and reload: it should still work (service worker).
* Each visitor's progress stays in **their own browser** (IndexedDB) — there is no shared database or login.
* To update the site: change files → `npm run precache` → deploy again. The service worker detects the new
  `precache.json` version and refreshes the cache on the next visit.
* A custom domain is configured in the host's dashboard (Vercel: Settings → Domains).

## Admin panel needs a Node host

Everything above hosts the **player site** (static files). The admin panel (`/admin/`) and its API are a small Node.js server
(`npm start`, Node 22.13+, SQLite file in `data/`) and **cannot run on static hosting**. If you upload this repository to a
static host the player site works exactly as before, and `/admin/` simply cannot sign in. To use the admin panel, deploy the
project to a Node host with a persistent disk, run `npm run db:migrate && npm run admin:create -- --username <you>` once, and
read [ADMIN.md](ADMIN.md) (HTTPS, `ROOKERY_SECURE_COOKIES=1`, backups).
