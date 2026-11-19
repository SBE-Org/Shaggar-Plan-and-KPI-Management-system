# Hosting: Vercel + Render + Neon + Supabase

```
 Visitor's browser
       │  https://shaggar-pms.vercel.app
       ▼
 ┌─────────────┐   /api/*  (with the ORIGIN_SECRET header)   ┌──────────────┐
 │   Vercel    │ ───────────────────────────────────────────▶ │    Render    │
 │  frontend   │                                              │   backend    │
 │ (the pages) │                                              │  (Node.js)   │
 └─────────────┘                                              └──────┬───────┘
                                                        data         │        files
                                                  ┌──────────────────┴─────────────────┐
                                                  ▼                                    ▼
                                           ┌─────────────┐                     ┌──────────────┐
                                           │    Neon     │                     │   Supabase   │
                                           │ PostgreSQL  │                     │   Storage    │
                                           └─────────────┘                     └──────────────┘
                                          all records                    evidence files, backups
```

- **Frontend (Vercel):** the pages, in plain HTML, CSS and JavaScript. No React or build tool is
  needed. Vercel forwards every `/api/...` request to Render, so for the browser it is one site.
- **Backend (Render):** the Node.js server. It holds no data itself.
- **Neon:** the database (PostgreSQL). Neon alone is enough for the data.
- **Supabase:** only its Storage, for evidence files and backups, in a private bucket.

Put everything in the same region (Frankfurt / `eu-central-1`): the backend talks to the
database on every request, so distance adds up.

Both Vercel and Render deploy from GitHub. Put this folder in a **private** GitHub repository
first. The `.env` files with real values must never be committed (`.gitignore` already
excludes them).

You will fill in two files. Copy them, then change the values:

| File | Used by | Holds |
|---|---|---|
| `backend/.env.example` → paste into Render's Environment | Render | Neon, Supabase, ORIGIN_SECRET, email, security |
| `frontend/.env.example` → `frontend/.env` | `scripts/configure-vercel.js` and Vercel | Render address, ORIGIN_SECRET |

---

## Step 1 — Neon (database)

1. Sign up at neon.com and create a project. Region: **AWS Europe Central 1 (Frankfurt)**.
2. Click **Connect** and copy the connection string. It looks like
   `postgresql://neondb_owner:…@ep-…eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`.
   This is `DATABASE_URL`.

Nothing else to do: the backend creates the tables on its first start, and loads the sample
data and demo accounts into an empty database.

## Step 2 — Supabase (files)

1. Sign up at supabase.com and create a project. Region: **Central EU (Frankfurt)**.
   You don't need its database or sign-in features.
2. **Project Settings → API Keys:** copy the **Project URL** (`SUPABASE_URL`) and create or copy
   a **Secret key** that starts with `sb_secret_` (`SUPABASE_SECRET_KEY`). Keep it secret: it gives
   full access to the project's storage.
3. The bucket `shaggar-pms` is created automatically as a **private** bucket the first time a
   file is saved. If you prefer, create it yourself under **Storage → New bucket** with
   "Public bucket" switched **off**.

## Step 3 — the shared secret

Make one long random value, for example with `openssl rand -hex 32`, or any password generator
(64 characters). It goes in **both** Render and Vercel as `ORIGIN_SECRET`. With it, the backend
answers only requests that come through your Vercel site.

## Step 4 — Render (backend)

1. Sign in at render.com, connect GitHub, then **New → Blueprint** and choose the repository.
   Render reads `render.yaml` and proposes one web service, `shaggar-pms-api`.
2. Fill in the values it asks for, taken from `backend/.env.example`:
   `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ORIGIN_SECRET`, `DEMO_PASSWORD`
   (and `BREVO_API_KEY`, `EMAIL_FROM` when you set up email; they can stay empty for now).
3. **Apply.** When the deploy is live, open `https://<your-service>.onrender.com/api/health`.
   It should show `{"ok":true,…}`. Other addresses answer "Requests must come through the
   Shaggar PMS website". That is correct: the backend only talks to Vercel.

**Plan:** `render.yaml` uses **Starter**, which keeps the server awake so reminders, escalations
and the daily backup run on time. **Free** works for trying the system, but it sleeps after
15 minutes without visitors: the first visit then waits about a minute, and scheduled jobs
pause while it sleeps. Your data is safe either way, because it is in Neon and Supabase.

## Step 5 — Vercel (frontend)

1. On your computer, copy `frontend/.env.example` to `frontend/.env` and set
   `BACKEND_URL` to your Render address (for example `https://shaggar-pms-api.onrender.com`).
2. Run, in the project folder:
   ```
   node scripts/configure-vercel.js
   ```
   It writes `vercel.json`. Commit `vercel.json` and push. (Do **not** commit `frontend/.env`.)
3. At vercel.com: **Add New → Project**, import the repository, keep the defaults
   (`vercel.json` sets the build).
4. Before deploying, open **Environment Variables** and add `ORIGIN_SECRET` with the same
   value as on Render. Then **Deploy**.
5. Open the Vercel address and sign in as `tolera.g` with your `DEMO_PASSWORD`.

If the Vercel build stops with "vercel.json does not point to your backend yet", you skipped
step 2.

## Step 6 — before real use

Follow section 9 of the System Guide: replace the sample data, set up email (`BREVO_API_KEY`,
`EMAIL_FROM` on Render), send a test email from **Settings → Security**, give every account a
real address, change the administrator password, then set `DEMO_MODE` to `false` on Render.

---

## Moving an existing system to Neon and Supabase

If you already use the system with SQLite and want to keep its data:

1. Fill in `backend/.env` with `DATABASE_URL` and the `SUPABASE_*` values.
2. Copy the old database file and the `storage/uploads` folder to your computer, then run:
   ```
   node --disable-warning=ExperimentalWarning scripts/move-to-neon.js --sqlite path/to/shaggar-pms.db --uploads path/to/uploads
   ```
   It copies every record to Neon and every evidence file to Supabase. It refuses to overwrite
   a Neon database that already has data unless you add `--force`.

Without access to the files you can still move the records: download an encrypted backup
from the old system (**Data & integrations → Backup**) and use **Restore from file** in the new
one. Backups from the SQLite version restore into Neon.

## Backups

- The backend takes a backup every day (a compressed copy of all records) and keeps the
  newest 14 in the Supabase bucket under `backups/`. Download an encrypted copy now and then
  and keep it somewhere else.
- Neon also keeps its own short restore history (point-in-time restore in the Neon console).
- Evidence files are not inside the backups; they stay in the bucket.

## Costs and limits to watch

- **Neon Free:** 0.5–1 GB of storage per project and 100 compute-hours a month. The database
  sleeps after 5 minutes without queries and wakes in under a second. `SCHEDULER_MINUTES=30`
  keeps it from being woken too often. Check usage in the Neon console after the first weeks.
- **Supabase Free:** about 1 GB of file storage. Evidence files are limited to 10 MB each.
- **Render Starter:** about $7 a month. Check current prices on each provider's pricing page.

## How it runs (for the technical team)

- The backend has no external packages. It talks to PostgreSQL through its own small client
  (`backend/lib/pg.js`: TLS, SCRAM-SHA-256 with channel binding) and to Supabase through its
  REST API (`backend/lib/storage.js`).
- Without `DATABASE_URL` it uses a local SQLite file; without `SUPABASE_URL` it keeps files on
  disk. So `npm start` on a PC works with no set-up, exactly as before.
- Database calls run one at a time on a dedicated worker thread, as they did with SQLite.
  That is plenty for a city administration's users, as long as Render and Neon are in the same
  region.
- Tests: `npm test` runs on SQLite. `TEST_DATABASE_URL=postgres://… npm test` runs the same
  tests on PostgreSQL (the database is emptied first: use a separate test database).

## Troubleshooting

| What you see | Cause and fix |
|---|---|
| Vercel build: "vercel.json does not point to your backend yet" | Run `node scripts/configure-vercel.js` with `BACKEND_URL` set, commit `vercel.json`. |
| "Requests must come through the Shaggar PMS website" on the Vercel site | `ORIGIN_SECRET` is missing or different in Vercel or Render. Set the same value in both and redeploy both. |
| Vercel shows an error page for `/api/...` | `BACKEND_URL` is wrong, or the Render service is down or still waking (Free plan). Check `/api/health` on Render. |
| Render log: "password authentication failed" | `DATABASE_URL` was copied incompletely. Copy it again from Neon → Connect. |
| Render log: "The database did not answer within 30 seconds" | Neon project suspended (free limits reached) or wrong region/host. Check the Neon console. |
| "File storage refused the file (401/403)" | `SUPABASE_SECRET_KEY` is wrong, or a publishable key was used. Use a secret key (`sb_secret_…`). |
| Signed out right after signing in | `SECURE_COOKIES` must be `true` (HTTPS). |
| Everyone gets "Too many sign-in attempts" | `TRUST_PROXY` must be `true` on Render. |
