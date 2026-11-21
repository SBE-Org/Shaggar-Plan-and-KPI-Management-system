# Shaggar PMS — KPI & Performance Management System

**Shaggar City Administration · Office of the Mayor**

A web system for planning and tracking departmental performance. Departments set KPIs and targets. KPI officers report monthly results with evidence. Department heads verify the reports and the Mayor's Office approves them. Scorecards, alerts and corrective action plans follow automatically. It is for the administration's own staff only. Every important action is recorded in an audit trail.

> The full functional description is in [`docs/SYSTEM_DOCUMENT.md`](docs/SYSTEM_DOCUMENT.md).
> Hosting (Vercel + Render + Neon + Supabase): [`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## Contents

1. [Features](#features)
2. [Technology](#technology)
3. [Project structure](#project-structure)
4. [Quick start](#quick-start)
5. [Sample accounts](#sample-accounts)
6. [Configuration](#configuration)
7. [Changing the name and logo](#changing-the-name-and-logo)
8. [Running in production](#running-in-production)
9. [Database](#database)
10. [REST API](#rest-api)
11. [AI executive assistant](#ai-executive-assistant)
12. [Tests](#tests)
13. [Troubleshooting](#troubleshooting)

---

## Features

| Area | What it does |
|---|---|
| **KPI framework** | Each department proposes its own KPIs (definition, formula, data source, unit, direction, frequency, weight) together with their targets; the Mayor's Office approves or returns them |
| **Targets** | Proposed by the department, approved or returned by the Mayor's Office, then locked; changes need a revision request; every step is audited |
| **Performance reporting** | Monthly or quarterly submissions with evidence files and variance explanations; workflow: submit → verify → approve |
| **Scorecards** | Weighted department scores, ratings, trends, previous-period and last-year comparisons, executive dashboard |
| **Alerts & corrective actions** | Automatic alerts for underperformance, declining trends, overdue or returned reports; corrective action plans with owners and due dates |
| **Employee performance** | Employees propose individual targets and report results with evidence; the department head approves, verifies and evaluates |
| **Messages** | Built-in one-to-one chat between staff accounts: departments, the Mayor, the Mayor's Office and administrators; private to the two participants |
| **Notifications** | Always in-system; SMS and email through an outbox once the gateways are approved |
| **Users & access** | 8 roles, an editable permission matrix and department scoping; a department and its head's account are created in one form |
| **Security** | Salted PBKDF2 password hashes, one-time codes for privileged roles, lockout, idle timeout, masking of personal data |
| **Audit trail** | Sign-ins, records created, changes, approvals, assignments, status changes and exports, with before and after values |
| **Data management** | Search, filters, pagination and CSV export; daily backups with checksums; encrypted backup download and restore; retention and archival |
| **Configuration** | Workflow steps, escalation days for reports, thresholds, organisation name and logo |
| **Languages** | English, Afaan Oromoo and Amharic (draft translations of menus, titles and statuses; pending approval) |
| **Integrations** | Documented REST API (OpenAPI 3) with scoped API keys and signed webhooks |
| **AI assistant** | Answers questions from live data inside the user's access scope (Claude API, local Ollama model, or built-in rules) |
| **Quality** | Built-in accessibility and performance checks; usability test plan |

---

## Technology

| Layer | Choice | Why |
|---|---|---|
| Backend | **Node.js 22.5+**, no external packages | Nothing to install or patch; runs on any Windows or Linux server |
| Database | **PostgreSQL (Neon)** when `DATABASE_URL` is set, through a built-in client; otherwise **SQLite** via `node:sqlite` | Managed database in production; zero set-up on a PC |
| Files | **Supabase Storage** when `SUPABASE_URL` is set; otherwise the server's disk | Evidence files and backups survive on hosts without a disk |
| Hosting | Frontend on **Vercel**, backend on **Render** | See [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| Frontend | HTML, CSS and plain JavaScript, no build step | Easy for the City's ICT staff to maintain |
| Shared logic | `shared/` modules loaded by both server and browser | One scoring engine, so dashboards and the server always agree |

---

## Project structure

```
shaggar-pms/
├── README.md                  ← this file
├── package.json               ← npm scripts (no dependencies)
├── vercel.json, render.yaml   ← hosting (frontend on Vercel, backend on Render)
│
├── backend/                   ← API server
│   ├── server.js              ← HTTP server: routing, sessions, errors, static files
│   ├── config.js              ← environment configuration
│   ├── db.js                  ← database access layer (all SQL goes through here)
│   ├── lib/
│   │   ├── http.js            ← router, JSON bodies, cookies, security headers, rate limiting
│   │   ├── security.js        ← password hashing, tokens, AES-256-GCM encryption
│   │   ├── access.js          ← role permissions and department scoping
│   │   ├── audit.js           ← append-only audit log
│   │   └── notify.js          ← in-system notifications, SMS/email outbox, webhooks
│   ├── routes/                ← REST endpoints, grouped by module
│   │   ├── auth.js            ← sign-in, one-time codes, sessions, profile, public branding
│   │   ├── performance.js     ← KPIs, targets, submissions, evidence, action plans, employees
│   │   ├── notifications.js   ← notifications (mark read)
│   │   ├── admin.js           ← users, permissions, settings, branding, backups, API keys, audit
│   │   ├── ai.js              ← AI assistant
│   │   ├── chat.js            ← internal messages
│   │   └── publicApi.js       ← REST API v1 for other systems (API keys)
│   └── services/
│       ├── state.js           ← builds each user's scoped data; server-side scoring engine
│       ├── automation.js      ← scheduler: escalations, archival, daily backup
│       ├── backup.js          ← backup, verify, restore, encrypted export/import
│       └── ai.js              ← AI providers and data tools
│
├── database/
│   ├── schema.sql             ← all tables (SQLite / PostgreSQL)
│   └── seed.js                ← organisation, FY 2026/27 KPIs, sample data, demo accounts
│
├── shared/                    ← code used by BOTH backend and frontend
│   ├── constants.js           ← roles, permissions, events, formatting
│   └── performance.js         ← scoring engine (achievement, scores, bands, alerts)
│
├── frontend/                  ← browser application (served by the backend)
│   ├── index.html
│   ├── css/styles.css         ← themes (navy and light), layout, components
│   ├── assets/favicon.svg     ← default emblem
│   └── js/
│       ├── core.js            ← state, API client, access helpers, charts, translations, icons
│       ├── shell.js           ← layout, navigation, sign-in, data tables, search, dialogs, start-up
│       ├── performance.js     ← dashboard, scorecards, KPIs, targets, reporting, alerts, employees, reports
│       ├── services.js        ← notifications
│       ├── admin.js           ← users, audit, settings and branding, workflows, security, backups, API, quality
│       ├── assistant.js       ← AI assistant
│       └── chat.js            ← internal messages
│
├── docs/
│   └── SYSTEM_DOCUMENT.md     ← functional and technical system document
├── tests/
│   └── api.test.js            ← end-to-end API tests
└── storage/                   ← created at run time (database, uploads, backups); not in version control
```

---

## Quick start

**Requirements:** Node.js **22.5 or later** ([nodejs.org](https://nodejs.org)). Nothing else, and there is no `npm install` step.

```bash
# 1. get the code and enter the folder
cd shaggar-pms

# 2. (optional) copy the configuration template
cp backend/.env.example backend/.env   # optional on a PC: without DATABASE_URL and SUPABASE_URL it uses SQLite and local folders

# 3. start the server — the database is created and filled with sample data on first run
npm start

# 4. open the system
#    http://localhost:8080
```

Useful scripts:

| Command | Purpose |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start and restart automatically when files change |
| `npm run seed:reset` | Delete the database and reload the sample data |
| `npm test` | Run the API test suite |

---

## Sample accounts

All demo accounts use the password **`Shaggar@2026`** (set `DEMO_PASSWORD` in `.env` to change it before the first start).

Roles marked **2-step** also need a 6-digit code. While the SMS gateway is not approved and `DEMO_MODE=true`, the code is shown on the sign-in screen.

| Username | Name | Role | Department / scope | 2-step |
|---|---|---|---|---|
| `tolera.g` | Tolera Gemechu | Super Administrator | City-wide | ✓ |
| `mayor` | Mayor (demo account) | Mayor | City-wide | ✓ |
| `chaltu.b` | Chaltu Bekele | Mayor's Office Administrator | City-wide | ✓ |
| `gemechis.t` | Gemechis Tadesse | Department Head | Revenue | ✓ |
| `lalise.f` | Lalise Fikadu | Department Head | Land | ✓ |
| `bontu.a` | Bontu Abdisa | Department Head | Job Creation | ✓ |
| `dawit.h` | Dawit Hailu | Department Head | Trade | ✓ |
| `kedir.m` | Kedir Mohammed | Department Head | Infrastructure | ✓ |
| `hawi.t` | Hawi Tesfaye | Department Head | Health | ✓ |
| `meron.a` | Meron Alemu | KPI Officer | City-wide (central M&E) | |
| `ifa.g` | Ifa Gudeta | KPI Officer | Revenue | |
| `sena.o` | Sena Olana | Department Staff | Land | |
| `robsan.d` | Robsan Dhaba | Department Staff | Revenue | |
| `abdi.w` | Abdi Wako | Auditor / Reviewer | City-wide, read-only | ✓ |

**Try the full workflow:**
1. Sign in as `meron.a`. Go to **Reporting & approvals** and submit the overdue October report for **INFRA-01** with a file attached.
2. Sign in as `kedir.m` and verify it.
3. Sign in as `chaltu.b` and approve it. The Infrastructure scorecard updates, and the audit trail shows all three steps.

**Try proposing a KPI:**
1. Sign in as a Department Head, for example `lalise.f` (Land). Open **KPIs & targets** and click **Propose a new KPI**. Answer the six questions and send it. Until it is decided you can click **Edit** on it.
2. Sign in as `chaltu.b` (Mayor's Office). Open **KPIs & targets**, click **Review** on the proposal, then **Approve KPI and targets** or **Return for revision**.

**Try the targets workflow:**
1. Sign in as `gemechis.t` (Revenue head). Open **KPIs & targets**, click **Change targets** on REV-01, change the figures, give a reason and send.
2. Sign in as `chaltu.b` (Mayor's Office). The change is listed at the top of **KPIs & targets**. Click **Review**, then **Approve and lock** or **Return for revision**.

**Try employee self-reporting:**
1. Sign in as `robsan.d` (Revenue staff). Open **My performance**, click your name, then **Propose a target** or **Update result** (a file is required as evidence).
2. Sign in as `gemechis.t`. Open **Employees**, click the employee, then approve the target or verify the result.

> The Super Administrator (`tolera.g`) configures the system but does not set or approve targets.

> All figures in the sample data are illustrative. Before go-live, run `npm run seed:reset` on an empty server, or remove the sample records, then load the real plan.

---

## Configuration

Settings come from environment variables, or from `backend/.env` (copy `backend/.env.example`, which explains every value). The frontend's settings are in `frontend/.env.example`. Everything is optional on a PC.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Where the server listens |
| `DEMO_MODE` | `true` | Lists demo accounts on the sign-in page and shows one-time codes on screen. **Set to `false` in production.** |
| `DEMO_PASSWORD` | `Shaggar@2026` | Password given to demo accounts when the database is seeded |
| `SECURE_COOKIES` | `false` | Set to `true` behind HTTPS (Secure cookies + HSTS) |
| `DB_FILE`, `UPLOADS_DIR`, `BACKUPS_DIR` | `./storage/…` | Data locations |
| `PASSWORD_ITERATIONS` | `120000` | PBKDF2 work factor for new passwords |
| `MAX_BODY_MB` | `15` | Largest request (evidence uploads are limited to 10 MB per file) |
| `SCHEDULER_MINUTES` | `10` | How often escalations run |
| `BREVO_API_KEY` or `RESEND_API_KEY` | — | Email service used for sign-in codes and notifications |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | — | Sender address verified with that service, and the name shown to recipients |
| `SMS_GATEWAY_URL`, `SMS_GATEWAY_TOKEN` | — | HTTP SMS gateway (used after approval in **Notifications → Channels**) |
| `EMAIL_API_URL`, `EMAIL_API_TOKEN` | — | HTTP email service (same) |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | — / `claude-sonnet-5-5` | AI assistant using the Claude API |
| `OLLAMA_URL`, `OLLAMA_MODEL` | — / `llama3.1` | AI assistant using a self-hosted Ollama model |

Business rules are changed **inside the system**, not in files. They are stored in the `settings` table and every change is audited:

- **System settings:** scoring thresholds, achievement cap, reporting month, fiscal year, name and logo, departments
- **Workflows:** approval steps, segregation of duties, evidence rule, escalation days for reports
- **Security:** session timeout, lockout, password policy, which roles need 2-step sign-in, personal-data masking
- **Backup & retention:** retention periods, number of backups kept
- **Notifications:** SMS and email gateways, and which events use them

---

## Changing the name and logo

1. Sign in as a Super Administrator (`tolera.g`).
2. Go to **Settings → System settings → Name & logo**.
3. Edit **Organisation name**, **Office**, **System name** and **Short name**.
4. Choose a logo file (PNG, JPG, WEBP or SVG, under 500 KB; square works best). A preview appears straight away.
5. Click **Save name and logo**.

The change applies to everyone at once: the sign-in page, sidebar, browser tab and icon, the AI assistant's wording, SMS texts and the API documentation title. **Use the default emblem** removes the uploaded logo. The change is recorded in the audit trail.

SVG logos are checked on the server and rejected if they contain scripts.

---

## Running in production

1. **Server:** any Windows Server or Linux machine with Node.js 22 LTS. Two vCPUs, 4 GB RAM and 50 GB disk are enough for one city administration.
2. **Configuration** (`.env`):
   ```env
   NODE_ENV=production
   DEMO_MODE=false
   SECURE_COOKIES=true
   ```
3. **HTTPS:** put the app behind Nginx, IIS or another reverse proxy with a TLS certificate. Example Nginx block:
   ```nginx
   server {
     listen 443 ssl http2;
     server_name pms.shaggarcity.gov.et;          # your domain
     ssl_certificate     /etc/ssl/pms.crt;
     ssl_certificate_key /etc/ssl/pms.key;
     client_max_body_size 16m;
     location / { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto https; }
   }
   ```
4. **Run as a service** (Linux systemd example):
   ```ini
   [Unit]
   Description=Shaggar PMS
   After=network.target
   [Service]
   WorkingDirectory=/opt/shaggar-pms
   ExecStart=/usr/bin/npm start
   Restart=always
   User=shaggarpms
   Environment=NODE_ENV=production
   [Install]
   WantedBy=multi-user.target
   ```
   On Windows, use NSSM or Task Scheduler to run `npm start` as a service.
5. **Backups:** the server takes a daily backup into `storage/backups`. Also copy that folder, or download encrypted backups, to another location every week. Run a restore test every quarter.
6. **First sign-in:** sign in as `tolera.g`, change the password, then create the real accounts under **Users & access**. Disable or delete the demo accounts.
7. **Hardening checklist:** see **Security → Required at production deployment** inside the system and section 9 of the system document.

---

## Database

- **Schema:** `database/schema.sql`. About 30 tables, written in portable SQL (TEXT ids, ISO-8601 timestamps, JSON in TEXT columns).
- **Engine:** PostgreSQL (Neon) when `DATABASE_URL` is set; otherwise SQLite in WAL mode, with a single file at `storage/shaggar-pms.db`. The same code and tests run on both.
- **Access layer:** all queries go through `backend/db.js` (`all`, `get`, `run`, `insert`, `update`, `tx`).
- **PostgreSQL:** `backend/lib/pg.js` is a small built-in client (TLS, SCRAM-SHA-256); `db.js` converts `?` placeholders to `$1…`. To move an existing SQLite system: `scripts/move-to-neon.js` (see `docs/DEPLOY.md`).
- **Backups:** compressed JSON copies of all tables, restorable on either engine.
- **Seed data:** `database/seed.js` (run `npm run seed:reset`).
- **Upgrades:** `backend/db.js` brings an existing database up to the current schema at start-up (new tables, new columns, new permissions). No data is deleted and no manual step is needed.

Main tables: `users`, `role_permissions`, `sessions`, `departments`, `objectives`, `kpis`, `kpi_targets`, `target_proposals`, `submissions`, `submission_evidence`, `submission_history`, `action_plans`, `action_items`, `employees`, `employee_indicators`, `employee_evidence`, `messages`, `notifications`, `outbox`, `audit_log`, `api_keys`, `webhooks`, `backups`, `settings`. The full data dictionary is in the system document, section 7.

---

## REST API

- The **internal API** (`/api/...`) is used by the web app. It uses a session cookie, and each endpoint checks the role and the department scope.
- The **public API** (`/api/v1/...`) is for other city systems. It uses `Authorization: Bearer <api key>`, with keys and scopes created under **Integrations & API**.

| Method | Path | Scope |
|---|---|---|
| GET | `/api/v1/departments` | `perf:read` |
| GET | `/api/v1/departments/{code}/scorecard?period=Y\|Q1-Q4\|M0-M11` | `perf:read` |
| GET | `/api/v1/kpis` | `perf:read` |
| GET | `/api/v1/kpis/{code}/results` | `perf:read` |
| GET | `/api/v1/alerts` | `perf:read` |
| POST | `/api/v1/submissions` | `perf:submit` |
| GET | `/api/v1/audit?from=&to=` | `audit:read` |

The OpenAPI 3 specification is at **`/api/v1/openapi.json`**. Calls are limited to 60 per minute per key and recorded in the audit trail. Webhooks are POSTed with an `X-Shaggar-Signature: sha256=<HMAC>` header.

```bash
curl -H "Authorization: Bearer shg_live_xxxxxxxx" http://localhost:8080/api/v1/departments/REV/scorecard?period=Q1
```

---

## AI executive assistant

The assistant answers questions such as "Which departments need my attention?" or "Draft a memo to the Infrastructure head". It uses read-only tools that see only the data inside the user's role and department scope. Every question is audited.

| Option | Setting | Cost |
|---|---|---|
| Claude API | `ANTHROPIC_API_KEY=…` | Paid per use (Anthropic account) |
| Self-hosted open model | `OLLAMA_URL=http://ai-server:11434`, `OLLAMA_MODEL=llama3.1` | Free licence; needs a server, ideally with a GPU |
| None | (default) | Free; answers come from built-in rules (briefings, alerts, pending approvals) |

Questions are limited to 30 per user per hour.

---

## Tests

```bash
npm test
```

`tests/api.test.js` starts the server on a temporary database and checks:

- sign-in failures
- role enforcement
- 2-step sign-in
- the full submit → verify → approve workflow, including evidence upload and download and segregation of duties
- KPIs: proposed by the department with targets, returned, revised, approved, withdrawn
- targets: propose, approve, lock and revision; the Super Administrator cannot set targets
- employees: adding an employee with an account, proposing a target, reporting with evidence, verification
- departments: automatic code and creation of the head's account
- messages: delivery, unread counts, privacy from third parties
- planning and reporting only: no service desk and no citizen accounts
- the audit trail
- branding, including rejection of an SVG that contains a script
- backup and integrity check
- public API scopes

Inside the app, **Quality & testing → Run automated checks** tests every screen for accessibility (labels, button names, chart descriptions, keyboard access, colour contrast) and render time.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module 'node:sqlite'` | Upgrade Node.js to 22.5 or later (`node --version`) |
| Port already in use | Set `PORT=8090` in `.env` |
| Sign-in code never arrives | Codes go by email. Open **Settings → Security → Email for sign-in codes**, check that a service is connected, send a test email, and check the address on the account. For evaluation keep `DEMO_MODE=true` |
| Locked out of the admin account | Sign in as another administrator and unlock it under **Users & access**, or wait for the lockout to expire (15 minutes by default) |
| Start again with clean sample data | `npm run seed:reset` (**this deletes all data**) |

---

© Shaggar City Administration. Internal use.
