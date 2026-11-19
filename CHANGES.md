# Changes in version 1.6

- **Database on Neon (PostgreSQL)** when `DATABASE_URL` is set. The backend has its own small
  PostgreSQL client (TLS, SCRAM-SHA-256 with channel binding), so it still needs no packages.
  Without `DATABASE_URL` it keeps using SQLite, so a PC needs no set-up.
- **Files on Supabase Storage** (private bucket, created on first use) when `SUPABASE_URL` is
  set: evidence files and backups. Without it, files stay on the server's disk.
- **Backups** are now compressed JSON copies of all records, restorable on either database.
  Older SQLite backups and encrypted backup files from v1.4 still restore, also into Neon.
- **Frontend on Vercel, backend on Render.** `scripts/configure-vercel.js` writes `vercel.json`
  from `frontend/.env`; Vercel forwards `/api/*` to Render and adds a shared secret
  (`ORIGIN_SECRET`), so the backend answers only requests that come through the site. API
  answers are marked so that Vercel never caches them.
- `backend/.env.example` and `frontend/.env.example` list every setting, ready to copy.
- `scripts/move-to-neon.js` copies an existing SQLite system (records and evidence files) to
  Neon and Supabase.
- `TRUST_PROXY` uses the visitor's address behind a hosting proxy, so sign-in limits are per
  visitor. Hidden files such as `.env` are never served or published.
- Step-by-step guide: `docs/DEPLOY.md`. All tests run on SQLite and on PostgreSQL.

An existing database is upgraded automatically at start-up (new `format` column on backups).

# Changes in version 1.5

## Notifications open what they are about
- Clicking a notification, in the bell menu or on the Notifications page, now opens the page
  **and the record itself**: the report to verify or approve, the proposed KPI or targets,
  the corrective action plan, the citizen request, or the employee's record. It is marked
  read at the same time.
- Citizens are taken to their request in the citizen portal.
- Notifications created before this version are matched to their record from the KPI code,
  request reference or plan reference in the text.

## Reporting & approvals: clear next step for the Mayor's Office
- Every report now opens with a line saying where it stands and who acts next, for example
  "Step 2 of 3 — waiting for verification by Lalise Fikadu, head of Land, since 3 Nov".
- As the guide requires, a report must be verified by the department head before the
  Mayor's Office approves it. While it waits for verification the Mayor and the Mayor's
  Office can now:
  - **Remind the department head**, and
  - **Return it to the department** with a reason (for example, unreadable evidence).
  The Approve button is shown but disabled until the report is verified.
- Overdue and returned reports have a **Remind the department** button for the Mayor's
  Office, and for the department head (to remind their own KPI officers). Overdue cells
  that used to show only a short message now open a summary of who has to act.
- One reminder per report and step every 12 hours. Each reminder is in the audit trail.

## Brought in line with the System Guide
- Citizens no longer receive the staff directory or officer names in request history from
  the server (guide 4.7 and 7: citizens do not see staff names; each account receives only
  data in its scope). Before, the names were only hidden on the screen.
- A report waiting more than 3 days for **verification** now reminds the department head and
  the Mayor's Office administrators; the Mayor is reminded only about late **approvals**
  (guide 4.3).
- Page titles match the menu and the guide: **Reporting & approvals**, **Alerts & actions**.
- The evidence hint lists ZIP files, which were already accepted.

An existing database is upgraded automatically at start-up (new `link` column on
notifications).

# Changes in version 1.4

## Simpler KPIs and targets
- **One page.** "KPI library" and "Targets" are merged into **KPIs & targets**.
- **Six questions.** Proposing a KPI now asks: what you will measure, how it is measured,
  the unit, whether higher or lower is better, the target for the year, and the weight.
  The yearly target is shared across the months automatically.
- "Definition", "Measurement formula" and "Data source" became one box, "How is it
  measured?". "KPI officer who will report" was removed. "Strategic objective" is optional
  and sits under **More options** with the other rarely used settings.
- **Edit before approval.** Every undecided proposal, a new KPI or a change to approved
  targets, has an **Edit** button on its row, and can be withdrawn.
- Fixed: a KPI without a strategic objective was missing from the department scorecard.

## AI assistant
- The assistant gave the same briefing to almost every question when no AI model was
  connected. The built-in assistant now recognises the question and answers it: one
  department, one KPI, departments needing attention, weakest KPIs, comparison with last
  year, ranking, what is waiting for you, overdue reports, alerts, action plans, a draft
  memo, and how-to questions about the system.
- If a connected AI model cannot be reached, the built-in assistant answers and shows the
  reason, instead of an error.

## Sign-in codes by email
- The 6-digit sign-in code is sent to the email address on the account. SMS can still be
  chosen under Settings → Security.
- An email address is required when creating any account: users, department heads, and
  employees given a sign-in account.
- **Settings → Security → Email for sign-in codes** shows whether an email service is
  connected, lists accounts without a real address, and sends a test email.

### Setting up email
1. Create an account with an email service that offers an HTTPS API, for example Brevo
   (its free plan allows 300 emails a day).
2. In that service, add and verify the sender address the codes will come from.
3. Create an API key there.
4. On the server (Railway → the service → Variables) add `BREVO_API_KEY` with the key and
   `EMAIL_FROM` with the verified sender address. For Resend use `RESEND_API_KEY`.
5. Redeploy, sign in as the Super Administrator, open **Settings → Security** and click
   **Send a test email**.
6. Give every account that needs a code a real address (**Users & access**), starting with
   your own.
7. Only then set `DEMO_MODE=false`. Until then the code is also shown on the sign-in
   screen, so nobody is locked out.

# Changes in version 1.3

## Departments set their own KPIs and targets
- A Department Head (or KPI Officer) clicks **Propose a new KPI** on the dashboard, the KPI
  library or the Targets page.
- One form covers what is measured (name, definition, formula, data source, unit,
  direction, frequency, weight) and the targets for the year and each reporting period.
- The Mayor's Office approves the proposal or returns it with a comment. The proposer
  cannot approve, and neither can the Super Administrator.
- On approval the KPI becomes active and its targets are locked. Before that it is outside
  every score, alert and report, and no results can be submitted against it.
- A returned proposal can be revised and resubmitted, or withdrawn.
- A new department with no KPIs now shows a clear starting point on the Targets page.
- Fixed: the scorecard page failed for a department with a newly created KPI, because a
  new KPI has no last-year figures.

An existing database is upgraded automatically at start-up. KPIs already in the system
stay approved and active.

# Changes in version 1.2

## Built-in messages
- New **Messages** page in the sidebar (Services group): one-to-one chat between staff
  accounts, so a department can write to the Mayor, the Mayor's Office, an administrator
  or another department.
- People are listed by office and department and can be searched.
- Unread counts in the conversation list and in the sidebar; new messages arrive within a
  few seconds without reloading the page.
- Only the two participants can read a conversation. The audit trail records that a
  conversation started, not its content. Citizens have no access.
- Text only, up to 2,000 characters per message.
- Not included: group conversations, file attachments, and deleting or editing a message.

An existing database is upgraded automatically at start-up (new `messages` table and the
"internal messages" permission for every role except Citizen).

# Changes in version 1.1

This version applies the review comments on version 1.0. The full description of each
module is in [`docs/SYSTEM_DOCUMENT.md`](docs/SYSTEM_DOCUMENT.md).

## What changed

### 1. Targets are proposed by departments and approved by the Mayor's Office
- The Super Administrator no longer sets targets.
- A Department Head or KPI Officer proposes the annual target and the target for each
  reporting period.
- The Mayor or the Mayor's Office Administrator approves the proposal or returns it with a
  comment. The person who proposed cannot approve.
- Approved targets are locked. Changing them needs a revision request with a reason, which
  is approved the same way. The targets in force change only on approval.
- Screen: **KPIs & targets → Targets**.

### 2. Targets table: Q1 to Q4 are readable
- The quarterly columns had a fixed light background, which hid the text in the dark
  theme. They now follow the theme.

### 3. Employee performance has a real source of data
- The Department Head adds employees, with an optional sign-in account.
- The employee proposes individual targets; the Department Head approves or returns them.
- The employee reports each result and must attach evidence; the Department Head verifies
  or returns it. Only verified results against approved targets count in the score.
- An indicator can be linked to the department KPI it contributes to.
- Staff see only their own record, under **My performance**.

### 4. Sidebar: the whole menu is visible
- The menu is more compact, so **Settings** and **Users & access** fit on a normal laptop
  screen. "Quality & testing" moved inside the Settings group.
- A "more below" hint appears if the window is too short, and administrators have a
  Settings shortcut (gear icon) in the top bar.

### 5. Add department: one form
- The code is filled in automatically from the short name.
- The department head's name is typed in, not chosen from a list.
- Saving creates the head's account with a suggested username and a temporary password,
  shown once.

### 6. Dashboard and look
- Dark, grouped sidebar in both themes.
- The dashboard opens with a greeting, five stat cards with a coloured edge that open the
  related page, the performance scale, and a **Needs attention** panel with three counters
  and the most urgent alerts.
- The "declining trend" alert now names the KPI and lists the three months, for example:
  "New taxpayers registered (REV-02) is falling. Achievement against target dropped three
  reporting periods in a row: Aug 89.5%, Sep 84.5%, Oct 83.5%."

## Updating a system that is already running

1. Replace the files in the GitHub repository with the files of this version and commit.
   The host redeploys automatically.
2. At start-up the system upgrades the existing database by itself:
   - it adds the new tables and columns;
   - targets already in force are marked as approved, so reporting carries on unchanged;
   - existing employee figures are kept and marked as verified;
   - the new permissions are granted (Department Head and KPI Officer: propose targets;
     Mayor and Mayor's Office Administrator: approve targets) and the Super Administrator's
     "set targets" permission is removed.
3. No data is deleted. Nothing needs to be run by hand.

## Not included in this version

- Changing the definition or weight of an already approved KPI through approval. (New KPIs
  are proposed and approved from version 1.3; an approved KPI can still only be edited by
  the Super Administrator.)
- Separate approval duties for the Mayor and the Mayor's Office Administrator: both can
  approve reports and targets.
- Deactivating or deleting a department.
- Counting a missing report as zero in the score.
- Removing the sample data from a running system. The demonstration figures, including the
  employee figures, stay until the database is reset (`npm run seed:reset`) or the sample
  records are replaced with real ones.
