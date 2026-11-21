# System Document

## Shaggar PMS — KPI & Performance Management System

**Owner:** Shaggar City Administration, Office of the Mayor
**Version:** 1.8 (see `CHANGES.md` for what changed since 1.0)
**Fiscal year in sample data:** 2026/27 (2019 EFY)
**Status:** Ready for pilot. Translations and figures marked as draft or illustrative need approval before go-live.

---

## Contents

1. Introduction
2. System overview
3. Users, roles and access
4. Functional description by module
5. Business rules and calculations
6. Workflows and status models
7. Data model
8. Architecture
9. Security
10. Notifications and integrations
11. Backup, recovery and retention
12. Languages, accessibility, performance and testing
13. Sample accounts and demonstration script
14. Administration procedures
15. Known limitations and roadmap
- Appendix A — Permission matrix
- Appendix B — Glossary

---

## 1. Introduction

### 1.1 Purpose
This document describes what the Shaggar PMS does and how it works: its users, functions, business rules, data, architecture, security and operation. It is written for the Office of the Mayor, department heads, the Planning and M&E Directorate, the ICT Directorate, internal audit, and the developers who maintain the system.

### 1.2 Scope
The system covers:
- KPI and performance management for city departments: objectives, KPIs, targets, reporting, verification, approval, scorecards, alerts and corrective actions
- individual employee performance indicators and evaluation
- administration: users and access, workflow rules, security policy, notifications, backups and retention, integrations, quality checks, branding, and the audit trail
- an AI executive assistant that answers questions from the system's data

### 1.3 Problem it solves
Showing percentages alone does not manage performance. The system adds a complete loop:

**plan** (KPIs, formulas, targets) → **report** (evidence-based submissions) → **assure** (verification, approval) → **measure** (weighted scores) → **act** (alerts, corrective action plans, escalation) → **account** (audit trail, reports).

---

## 2. System overview

| # | Module | Main users | Purpose |
|---|---|---|---|
| 1 | Executive dashboard | Mayor, Mayor's Office, department heads | City or department score, ranking, headline KPIs, alerts, trend |
| 2 | AI assistant | Leadership, KPI officers, auditors | Ask questions in plain language; draft memos |
| 3 | Department scorecards | All performance roles | Weighted KPI scorecard grouped by strategic objective |
| 4 | KPIs & targets | Departments (propose), Mayor's Office (approve), others (view) | What each department is measured on and its targets, on one page |
| 5 | Reporting & approvals | KPI officers, department heads, Mayor's Office | Submit, verify and approve results with evidence |
| 6 | Alerts & actions | Department heads, Mayor's Office | Automatic alerts; corrective action plans |
| 7 | Employees | Employees (propose and report), department heads (approve, verify, evaluate) | Individual targets, self-reported results with evidence, evaluation |
| 8 | Reports | Leadership, auditors | Evaluation report with narrative, CSV export |
| 10 | Notifications | Everyone | In-system inbox; SMS and email outbox |
| 11 | Users & access | Super Administrator | Accounts, roles, permission matrix |
| 12 | Settings | Super Administrator | Scoring, calendar, name and logo, departments, workflows, security |
| 13 | Data & integrations | Super Administrator | Backups, retention, archive, API keys, webhooks |
| 14 | Quality & testing | Super Administrator | Accessibility and performance checks, usability plan |
| 15 | Audit trail | Mayor, auditors, administrators | Who did what, when, and what changed |

---

## 3. Users, roles and access

### 3.1 Roles

| Role | Main responsibility | Default scope |
|---|---|---|
| **Super Administrator** | Full system configuration and management. A technical role: it does **not** set or approve targets | City-wide |
| **Mayor** | Executive overview, decision monitoring, final approval of reports and of proposed targets | City-wide |
| **Mayor's Office Administrator** | Daily coordination for the Mayor; approves performance data and proposed targets | City-wide |
| **Department Head** | Department activities, KPIs, proposing targets, verification, corrective actions, adding employees, approving individual targets, verifying employee results, staff evaluation | Own department |
| **Department Staff** | Proposes own individual targets and reports own results with evidence | Own department / own assignments / own performance record |
| **KPI Officer** | Performance submissions and reporting; drafts target proposals | Own department, or city-wide for central M&E (no department set) |
| **Auditor / Reviewer** | Read-only access to authorised reports and audit records | City-wide, read-only |

### 3.2 How access is decided
Every request to the server is checked in this order:
1. **Authentication.** There must be a valid session cookie, not idle longer than the session timeout, and at most 12 hours old.
2. **Permission.** The role must hold the needed permission (Appendix A). The matrix can be edited under **Users & access → Roles & permission matrix**. Three administrator permissions are locked so that administrators cannot lock themselves out.
3. **Department scope.** City-wide roles see every department. Department roles see only their own. The server filters every response, so the browser never receives data outside the user's scope.
4. **Record rules.** Some rules apply to individual records:
   - only the head of the KPI's department can verify a report
   - segregation of duties: nobody verifies or approves their own work
   - staff see only their own performance record
   - nobody can evaluate themselves

---

## 4. Functional description by module

### 4.1 Executive dashboard
The page opens with a greeting and one sentence saying which period and data it shows. From top to bottom:
- **Stat cards** (each opens the related page when clicked, and has a coloured edge):
  - city (or department) index, with a trend line and change against last year
  - KPIs on track
  - alerts, with the number that are serious or critical
  - items waiting for me
  - open corrective action plans
- **Performance scale:** every department placed on one 40–120% scale, with coloured bands and a gold marker for the city index. A one-sentence summary sits above it.
- **Department ranking:** score, status, change against the previous period or last year, and how many reports are approved.
- **Needs attention:** three counters chosen for the user's role (reports to approve or verify, targets to approve or returned, employee items to review, serious alerts), followed by the most urgent alerts.
- **Headline KPI table:** one KPI per department (the highest-weighted), showing target, actual and achievement.
- **Monthly index chart.**
- **Period selector:** monthly, quarterly or annual (year-to-date). The "Include unapproved (provisional)" switch adds reports that are submitted or verified but not yet approved.

The sidebar is grouped (Performance, Services, System) and compact, so the whole menu, including **Settings** and **Users & access**, is visible on a normal laptop screen. If the window is too short, a "more below" hint appears. Administrators also have a Settings shortcut (gear icon) in the top bar.

### 4.2 Department scorecards
- Header with score ring, rating, department head, data coverage, change against the previous period and against last year.
- KPI table grouped by strategic objective: weight, target, actual, achievement bar, achievement %, weighted points, status, monthly trend line, last year's achievement.
- Charts: monthly score; this year against last year by quarter.
- The department's corrective action plans and employee indicators.
- A warning appears if KPI weights do not total 100%.

### 4.3 KPIs & targets
One page shows what each department is measured on (its KPIs) and how much it has committed to achieve (its targets). **Each department sets its own, and the Mayor's Office approves them.**

**Proposing a KPI.** A Department Head (or KPI Officer) clicks **Propose a new KPI**, on this page or on the dashboard, and answers six questions:

| Question | Example |
|---|---|
| What will you measure? | Property tax collected |
| How is it measured? | Property tax paid into the city account each month, from the treasury bank statement |
| Unit | ETB M |
| A good result is | Higher |
| Target for the year | 240 |
| Weight in the department score | 20 |

The yearly target is shared equally across the months. A closed **More options** section holds what is rarely needed: quarterly reporting, whether results are added up or averaged (chosen automatically from the unit), a different target for each period, last year's result, whether evidence is required, and the city goal the KPI supports.

**Before a decision.** The proposal is listed under "Sent for approval" with an **Edit** button. The department can change or withdraw it until the Mayor's Office decides.

**Approval.** The Mayor's Office sees the same list as "Waiting for your decision", clicks **Review**, and approves or returns the proposal with a comment. The proposer cannot approve, and neither can the Super Administrator. On approval the KPI becomes active, gets its code (for example `LAND-04`), counts in the scores, and its targets are locked. Until then it is outside every score, alert and report.

**Changing approved targets.** The department clicks **Change targets** on the KPI's row, enters the new figures and must give the reason. The targets in force stay unchanged until the change is approved. A pending change can also be edited or withdrawn.

- The list of approved KPIs shows, per department: name, code, unit, weight, annual target, the four quarterly targets and the approval status. Clicking a KPI opens its monthly targets and results.
- The weights of a department's approved KPIs should total 100%; the page shows a warning otherwise.
- Every proposal, edit, approval, return and withdrawal is recorded in the audit trail.
- The Super Administrator keeps separate tools at the foot of the page to maintain the city goals and to add a KPI directly. That permission can be switched off in the permission matrix.

### 4.4 Reporting & approvals
- **Reporting calendar:** a grid of KPIs against months, with a status in each cell. Statuses are: Approved, Verified · awaiting approval, Awaiting verification, Returned, Draft, Overdue, Open for reporting, and Not yet due.
- **Submission form:**
  - shows the target, formula and data source
  - takes the actual value and calculates achievement as it is typed
  - accepts evidence files: PDF, images, Office documents, CSV or ZIP, up to 10 MB each, stored on the server with a SHA-256 fingerprint
  - takes a narrative
  - requires a variance explanation of at least 15 characters when achievement is below the variance threshold (default 90%)
  - can be saved as a draft or submitted for verification
- **Submission detail:**
  - target, actual and achievement, with the previous period for comparison
  - evidence, downloadable
  - narrative
  - full workflow history
  - action buttons that depend on the user's role and the report's status, with a comment box (a comment is required when returning)
- **Awaiting my action** lists what the user must act on. Approvers also see **Approve all verified**, which respects segregation of duties.
- **All submissions** is a searchable, filterable, paged and exportable table.

### 4.5 Alerts & corrective actions
- Alerts are generated automatically (rules in §5.6). Each alert offers the next step: **Submit now**, **Open**, **Create action plan**, or a link to the existing plan.
- A **corrective action plan** has:
  - a reference (CAP-YYYY-NNN), department and linked KPI
  - a title, the trigger (the performance gap) and a root-cause analysis
  - actions, each with a text, owner and due date, ticked off when done
  - progress updates and Mayor's Office review comments
  - a status: Open, In progress or Completed. A plan can be completed only when all of its actions are done.

### 4.6 Employee performance
Individual performance follows the same principle as department performance: the person who proposes or reports is not the person who approves or verifies.

1. **Add the employee.** The Department Head adds the employee (name, position) and can create a sign-in account in the same step. The temporary password is shown once.
2. **Set the targets.** The employee proposes individual indicators (name, unit, direction, target, weight, and optionally the department KPI it contributes to). The Department Head approves each one or returns it with a comment. A target set by the head takes effect at once. Approved targets are locked for the employee.
3. **Report the result.** Each period the employee reports the actual result and must attach evidence (register, report, system extract, photo).
4. **Verify.** The Department Head opens the evidence and verifies the result or returns it with a comment. **Only verified results against approved targets count** towards the weighted score.
5. **Evaluate.** The Department Head records the rating (Outstanding, Very good, Good, Needs improvement, Unsatisfactory) and comments on performance and development needs. Nobody can approve, verify or evaluate their own record.

- For an employee without a sign-in account, the head records the results on their behalf; they are saved as verified by the head.
- Staff open their own record under **My performance**; they never see colleagues' records.
- Every step is recorded in the audit trail, and both sides are notified.

### 4.7 Reports & evaluation
The performance evaluation report for the selected period contains:
1. An automatically written executive summary: the index, best and worst departments, the biggest KPI gaps, alerts and open plans.
2. Department results with previous-period and last-year comparisons.
3. KPI detail.
4. Alerts.
5. Corrective action plans.

**Copy summary** and **Copy KPI data (CSV)** buttons are provided.

### 4.8 AI assistant
The assistant answers questions about the performance data the user is allowed to see, explains how to do things in the system, and drafts memos. It cannot change anything, every question is recorded in the audit trail, and each user is limited to 30 questions per hour.

It works in two modes:

- **Built-in assistant (default, no cost).** It recognises the kind of question and answers from live data: a briefing; one department; one KPI by code or name; which departments need attention; the weakest KPIs; comparison with last year; ranking; what is waiting for the user; overdue reports; alerts; action plans; KPI and target proposals; employees; a draft memo to a department head; and how-to questions such as "How do I propose a KPI?". When it cannot match a question it lists what it can answer.
- **Connected AI model (optional).** With `ANTHROPIC_API_KEY` (paid per use) or `OLLAMA_URL` (self-hosted) set on the server, free-form questions go to the model, which uses read-only tools limited to the user's scope. If the model cannot be reached, the built-in assistant answers and says why.

### 4.9 Messages
A built-in chat for staff, so departments can write to the Mayor, the Mayor's Office, an administrator or another department without leaving the system.

- **One-to-one conversations** between any two staff accounts.
- **New** opens the list of people, grouped by office and department and searchable by name, role or department.
- The conversation list shows the latest message, its time and an unread count. The **Messages** entry in the sidebar shows the total unread, and a short notice appears when a message arrives while the user is on another page.
- New messages appear within a few seconds without reloading, and a message being typed is never interrupted. Sent messages show "read" once the other person has opened them.
- **Privacy:** only the two participants can read a conversation. Administrators cannot read other people's messages through the system. The audit trail records that a conversation was started, never what was said.
- Messages are text only, up to 2,000 characters each. Files are not attached here; evidence belongs with the report it supports.
- The permission "Send and receive internal messages" controls access per role (on for every role).

### 4.10 Notifications
- **Inbox:** every user can filter by event and read status, and mark all as read. The bell in the top bar shows unread notifications.
- **Click to open:** clicking a notification, in the bell or the inbox, marks it read and opens what it is about: the report, the proposed KPI or targets, the action plan or the employee record.
- **Channels & rules** (administrators):
  - SMS and email gateway details, each with an "approved for use" switch
  - an event × channel matrix that sets which events use SMS or email
- **Outbox** (administrators): every SMS and email with its status — Held, Sent or Failed.

### 4.11 Users & access
- **Users:** create (a temporary password is shown once, and the user must change it at first sign-in), edit, disable, reset password, unlock.
- **Roles & permission matrix:** grant or revoke permissions per role.

### 4.12 Email and sign-in codes
- **Every account needs a working email address.** It is required when an account is created (users, department heads, and employees given a sign-in account), and users can correct their own under **My profile**.
- **Two-step sign-in sends the 6-digit code by email** to the address on the account. The sign-in screen shows the address partly hidden. Codes are valid for 5 minutes and are never stored in readable form.
- **Email service.** Mail goes through an HTTPS email service, because most hosts block direct mail ports. Set `BREVO_API_KEY` or `RESEND_API_KEY`, and `EMAIL_FROM` (a sender address verified with that service), in the server variables.
- **Settings → Security → Email for sign-in codes** shows whether a service is connected, lists accounts that still have a sample address, and has a **Send a test email** button.
- **Demonstration mode** also shows the code on the sign-in screen. With it off, a code that cannot be emailed stops the sign-in with the reason, so turn it off only after the test email arrives and the accounts have real addresses.
- The policy can be switched to SMS under **Settings → Security** once an SMS gateway is approved.

### 4.13 Settings
- **Scoring & calendar:**
  - status thresholds (on track, alert, critical)
  - achievement cap and variance-explanation threshold
  - report deadline day and current reporting month
  - fiscal year labels and start year
- **Name & logo:**
  - organisation name, office, system name and short name
  - logo upload with preview (PNG, JPG, WEBP or SVG, under 500 KB; SVGs with scripts are rejected)
  - reset to the default emblem
- **Departments:** add or edit a department in one form.
  - The **code** is filled in automatically from the short name (for example "Water Supply" gives `WATER`; a number is added if the code is taken). It can be changed before saving.
  - The **department head's name is typed in**; it is not chosen from a list. Saving creates the head's account (role Department Head, limited to that department) with a suggested username and a temporary password that is shown once.
  - On edit, a corrected name updates the same person. Ticking "A new person is taking over" creates a new account and switches off the previous head's account.
- **Workflows:** approval steps, segregation of duties, the evidence default, and escalation days for reports.
- **Security:** session timeout, lockout, password policy, 2-step sign-in roles and personal-data masking. This page also lists the active controls and the production hardening checklist.

### 4.14 Data & integrations
- **Backup & retention:** create, verify, restore, download (encrypted) and delete backups; restore from a file; retention rules; run archival; browse and restore archived records; written backup and recovery procedures.
- **Integrations & API:** endpoint documentation and the OpenAPI file, API keys (create, scope, revoke), a console that sends live requests, and webhooks.

### 4.15 Quality & testing
- **Run automated checks** renders every screen the administrator can open and checks:
  - labelled form fields
  - named buttons
  - described charts
  - keyboard reachability
  - one page title per screen
  - element count
  - render time against a 300 ms budget
  - colour contrast against WCAG 2.2 AA
- Results are stored.
- A usability-session tracker and the pre-go-live test plan are included.

### 4.16 Audit trail
- The audit trail is filtered and paged on the server. Filters: text search, category, user (including "System"), record type and date range.
- Each entry shows when, who (with role), the action, a category tag, the record, details, and the changed fields as before → after.
- Category counts are shown. **Export CSV** produces a full filtered export, and the export itself is audited.

### 4.17 Global features
- **Search** (Ctrl/⌘ K) across pages, departments, KPIs, action plans and people.
- **Themes:** navy (default) and light.
- **Languages:** English, Afaan Oromoo and Amharic.
- **Collapsible sidebar** with grouped navigation and count badges; a profile card with My profile, Change password and Sign out.
- **Responsive layout** for desktop, tablet and phone.

---

## 5. Business rules and calculations

All calculations live in **`shared/performance.js`**. The same code runs in the browser and on the server, so the two can never disagree.

### 5.1 Fiscal calendar
- The fiscal year runs from **July to June**. Month index 0 = July … 11 = June.
- **Quarterly KPIs** report in the last month of each quarter (Sep, Dec, Mar, Jun).
- The **current reporting month** is set in Settings. Months before it are "closed" and due for reporting.

### 5.2 Achievement

| KPI direction | Formula |
|---|---|
| Higher is better | Achievement % = Actual ÷ Target × 100 |
| Lower is better (e.g. turnaround days) | Achievement % = Target ÷ Actual × 100 |

### 5.3 Aggregation over a period
- Only months that are due and closed are counted.
- By default only **approved** results count. With "provisional" switched on, submitted and verified results count too.
- **Sum** KPIs (counts, money) add targets and actuals; **average** KPIs (rates, %, days) average them.
- Targets are compared only for the months that have a counted result. Coverage (counted ÷ due) is always shown, and missing reports raise their own alerts.

### 5.4 Department and city scores
- **Department score** = Σ (KPI weight × min(achievement, cap)) ÷ Σ (weights of KPIs that have data).
- The default **cap is 120%**, so over-achievement on one KPI cannot hide failures on others.
- **City index** = the average of the department scores in the user's scope.
- **Employee score** = the same weighted formula over individual indicators.

### 5.5 Rating bands (configurable)

| Score | Rating | Shown as |
|---|---|---|
| ≥ 90% | On track | ✓ green |
| 75–89.9% | Needs attention | ! amber |
| 60–74.9% | Underperforming | ▼ orange |
| < 60% | Critical | ✕ red |

Status is never shown by colour alone: every status has an icon and a label.

### 5.6 Automatic alert rules

| Alert | Condition | Severity |
|---|---|---|
| Underperforming department | Department score < 75% for the period | Band of the score |
| KPI below threshold | KPI achievement < 75% | Band of the achievement |
| Declining trend (early warning) | Three consecutive falls in monthly achievement, latest below 90%. The alert names the KPI and lists the three months with their achievement | Warning |
| Overdue submission | Due month closed, no submission after the deadline day (default the 10th of the next month) | Serious |
| Returned for correction | A submission has been returned and not yet resubmitted | Warning |
| Corrective action overdue | An open plan has an action past its due date | Serious |

On approval, the server also sends notifications:
- to the department head and approvers when the approved KPI is below 75%
- to the department head and the Mayor when the department's monthly score is below 75%

### 5.7 Escalation rules (configurable)


**Performance reports:**
- submitted but not verified within 3 days: the department head and approvers are told
- verified but not approved within 3 days: approvers and the Mayor are told

### 5.8 Validation rules
- **Evidence:** required when the KPI is marked "evidence required" (the default).
- **Variance explanation:** required when achievement is below the variance threshold.
- **Return comment:** at least 5 characters.
- **Segregation of duties:** the submitter cannot verify; the verifier and the submitter cannot approve.
- **Weights:** should total 100% per department; a warning is shown otherwise.
- **Action plans:** a plan cannot be completed while any of its actions is open.
- **Passwords:** at least 10 characters, with upper- and lower-case letters, a number and a symbol (configurable).

---

## 6. Workflows and status models

### 6.1 Performance submission

```
           save draft                     verify (dept head)            approve (Mayor's Office)
 (none) ───────────────▶ Draft ──submit──▶ Submitted ─────────────────▶ Verified ─────────────────────▶ Approved
                           ▲                  │                            │                               │
                           │      return (with reason)        return (with reason)              counts in official
                           └──── Returned ◀───┴────────────────────────────┘                    scores and reports
                                    │  correct & resubmit
                                    └──────────────────────▶ Submitted
```

- Turning off "Department head verification required" moves a submitted report straight to Verified.
- Turning off "Mayor's Office approval required" approves it automatically after verification.
- Every step writes a history line, an audit entry and notifications.
- The report shows where it stands and who acts next. While a report waits for verification, the Mayor's Office can remind the department head or return the report, but cannot approve it until it is verified.
- **Reminders:** the Mayor's Office can remind the department head (report awaiting verification) or the department (report overdue, draft or returned); a department head can remind their own KPI officers. One reminder per report and step every 12 hours; each is recorded in the audit trail.

### 6.2 KPI proposal
```
 Department proposes KPI + targets ─▶ Awaiting approval ─approve─▶ Approved: active, targets locked
                                            │  ▲
                                       return│  │revise and resubmit        (inactive and outside all scores until approved)
                                            ▼  │
                                      Returned for revision ─withdraw─▶ removed
```

### 6.3 Changes to approved targets
```
 Not yet approved ─propose─▶ Awaiting approval ─approve─▶ Approved · locked ─revision request (reason)─▶ Awaiting approval
                                   │  ▲
                              return│  │resubmit            (the targets in force change only on approval)
                                   ▼  │
                             Returned for revision ─withdraw─▶ Withdrawn
```

### 6.4 Employee target and result
```
 target:  Proposed (employee) ─approve─▶ Approved        result:  Reported + evidence ─verify─▶ Verified (counts in the score)
               └──return (comment)──▶ Returned ─resubmit─┘                 └──return (comment)──▶ Returned ─correct─┘
```

### 6.5 Corrective action plan
```
 alert ─▶ Open ──first action done──▶ In progress ──all actions done──▶ Completed ──(after retention)──▶ Archived
                       ▲  progress updates · Mayor's Office review comments
```

### 6.6 Sign-in
```
 username + password ─▶ (wrong 5×) account locked 15 min
        │ correct
        ├─ role needs 2-step ─▶ 6-digit code by SMS (5 min, 3 tries) ─▶ session
        └─ otherwise ───────────────────────────────────────────────▶ session
 session: HttpOnly cookie · idle timeout 30 min · max 12 h · temporary password must be changed first
```

---

## 7. Data model

The schema is in `database/schema.sql`. Ids are TEXT, timestamps are ISO-8601 UTC, and booleans are 0/1.

| Table | Purpose | Key columns |
|---|---|---|
| `settings` | Configuration documents (JSON) | `key` (branding, scoring, security, workflow, notify, retention), `value`, `updated_by` |
| `departments` | Organisation units | `id` (code), `name`, `short_name`, `head_user_id` |
| `users` | Accounts | `username`, `role`, `dept_id`, `password_hash`, `password_salt`, `failed_attempts`, `locked_until`, `must_change`, `active`, `lang` |
| `role_permissions` | Permission matrix | `role`, `permission` |
| `sessions` | Signed-in sessions | `token_hash` (SHA-256), `user_id`, `last_seen`, `expires_at`, `ip` |
| `otp_challenges` | One-time sign-in codes | `code_hash`, `expires_at`, `attempts` |
| `objectives` | Strategic objectives | `id` (SO1…), `title` |
| `kpis` | KPI definitions, including proposals (`approval`: proposed, returned, approved; `proposed_by`, `decided_by`, `decision_comment`) | `code`, `dept_id`, `objective_id`, `formula`, `source`, `unit`, `direction`, `frequency`, `aggregation`, `weight`, `annual_target`, `evidence_required`, `owner_id` |
| `kpi_targets` | Monthly targets in force | `kpi_id`, `month` (0–11), `target` |
| `target_proposals` | Targets proposed by a department | `kpi_id`, `annual`, `targets` (JSON), `reason`, `is_revision`, `status`, `proposed_by`, `decided_by`, `decision_comment` |
| `kpi_prev_year` | Last year's quarterly results | `kpi_id`, `quarter`, `target`, `actual` |
| `submissions` | Reported results | `kpi_id`, `month`, `actual`, `note`, `status`, `submitted_by/at`, `verified_by/at`, `approved_by/at` |
| `submission_evidence` | Evidence files | `submission_id`, `file_name`, `size`, `mime`, `storage_path`, `sha256` |
| `submission_history` | Workflow steps | `submission_id`, `user_id`, `action`, `comment`, `at` |
| `action_plans` / `action_items` / `action_updates` | Corrective action plans | `ref`, `dept_id`, `kpi_id`, `root_cause`, `status` / `text`, `owner_id`, `due_date`, `done` / `kind` (update, review), `text` |
| `employees` / `employee_indicators` / `employee_evidence` / `employee_evaluations` | Individual performance | `dept_id`, `user_id` / `target`, `weight`, `kpi_id`, `status`, `reported_actual`, `report_status`, `actual` (verified), `verified_by` / `file_name`, `sha256` / `rating`, `comment`, `evaluated_by` |
| `messages` | Internal one-to-one messages | `from_id`, `to_id`, `body`, `created_at`, `read_at` |
| `notifications` | In-system inbox | `user_id`, `text`, `event`, `link` (what it is about, opened on click), `is_read` |
| `outbox` | SMS and email queue | `channel`, `recipient`, `status` (held, sent, failed) |
| `audit_log` | Audit trail (append-only) | `at`, `user_id`, `role`, `action`, `category`, `entity`, `entity_id`, `details`, `before_json`, `after_json`, `ip` |
| `api_keys` / `webhooks` | Integrations | `key_hash`, `scopes`, `revoked` / `url`, `events`, `secret`, `active` |
| `backups` | Backup index | `kind`, `size`, `checksum`, `file_name` |
| `qa_runs` / `qa_sessions` | Quality records | `results` (JSON), `passed` / `role`, `task`, `status`, `findings` |

---

## 8. Architecture

### 8.1 Overview

```
 ┌──────────────────────────── Browser (desktop · tablet · phone) ────────────────────────────┐
 │ frontend/  index.html · css · js (core, shell, performance, services, admin, assistant)   │
 │ shared/    constants.js · performance.js  ◀── same scoring engine as the server           │
 └───────────────▲─────────────────────────────────────────────────────────────────────────────┘
                 │ HTTPS · JSON · HttpOnly session cookie
 ┌───────────────┴──────────────────────── backend/ (Node.js 22) ─────────────────────────────┐
 │ server.js: routing · session check · must-change-password gate · CSRF origin check · errors│
 │ routes/: auth · performance · notifications · admin · ai · chat · publicApi (/api/v1, API keys)            │
 │ lib/: access (roles, scope) · audit · notify (inbox, outbox, webhooks) · security · http   │
 │ services/: state (per-user data, engine) · automation (scheduler) · backup · ai            │
 └──────┬───────────────────────────┬─────────────────────────────┬───────────────────────────┘
        │ db.js (SQL)               │ files                       │ HTTP (optional, after approval)
 ┌──────▼──────────┐    ┌───────────▼──────────────┐    ┌─────────▼────────────────────────────┐
 │ SQLite (WAL)    │    │ storage/uploads (evidence)│    │ SMS gateway · email API · webhooks · │
 │ schema.sql      │    │ storage/backups           │    │ Claude API or Ollama (AI)            │
 └─────────────────┘    └──────────────────────────┘    └──────────────────────────────────────┘
```

### 8.2 How a page loads
1. The browser loads `index.html`, the shared modules and the app scripts.
2. `GET /api/public/branding` returns the name, logo, sign-in policy and, in demo mode only, the demo accounts.
3. After sign-in, `GET /api/bootstrap` returns everything the user may see, already filtered by role and department.
4. Pages render in the browser using the shared engine.
5. Every change is a specific API call, such as `POST /api/submissions/:id/action`. The server validates permission, scope and business rules, writes the change inside a transaction, writes the audit entry, sends notifications and returns. The browser then reloads its data.
6. The audit trail is the one exception to step 3: it is too large to load in full, so it is paged on the server.

### 8.3 Background automation
`services/automation.js` runs at start-up and every 10 minutes:
- report escalations
- daily archival (retention purge, archiving of closed records, removal of expired sessions and codes)
- the daily backup

### 8.4 Design choices
- **No third-party packages.** Fewer security updates, and no supply-chain risk.
- **One scoring engine** shared by the browser and the server.
- **One database access layer** (`db.js`), with portable SQL, so moving to PostgreSQL changes one file.
- **Settings stored as data** (`settings` table), so administrators change rules in the interface and every change is audited.

---

## 9. Security

### 9.1 Controls implemented

| Area | Control |
|---|---|
| Passwords | PBKDF2-SHA256, 120,000 iterations, unique salt; policy enforced on the server; temporary passwords must be changed at first sign-in |
| Sign-in | Lockout after 5 failures (15 min); rate limit of 30 attempts per 15 min per IP; 2-step one-time code **sent by email** (SHA-256 hashed, 5 min, 3 tries) for privileged roles; SMS can be chosen instead |
| Sessions | Random 256-bit token; only its SHA-256 hash is stored; HttpOnly, SameSite=Strict cookie (Secure behind HTTPS); idle timeout; 12 h maximum; all of a user's sessions end when the password changes or the account is disabled |
| Authorisation | Permission and department scope checked on every endpoint; responses filtered on the server; segregation of duties enforced on the server |
| Web security | Content-Security-Policy, X-Frame-Options DENY, nosniff, Referrer-Policy, HSTS with HTTPS; same-origin check on state-changing requests; JSON size limit; all output escaped in the browser |
| Files | Allowed types only; 10 MB per file; stored outside the web root with generated names; SHA-256 fingerprint; download checks the user's scope; SVG logos scanned for scripts |
| Encryption | In transit: TLS through the reverse proxy. Downloaded backups: AES-256-GCM with a PBKDF2 key (210,000 iterations) and an integrity tag |
| Accountability | Append-only audit trail with before and after values, IP address and category; covers sign-in, failures, lockouts, exports, API calls and AI questions |
| API | Hashed API keys with scopes; 60 calls per minute; revocation; every call audited; webhooks signed with HMAC-SHA256 |

### 9.2 Required at deployment
1. Serve only over HTTPS (TLS 1.2+); set `SECURE_COOKIES=true` and `DEMO_MODE=false`.
2. Encrypt the server disk, or use database encryption at rest. Keep backups encrypted and off-site.
3. Restrict operating-system access to the `storage/` folder to the service account.
4. Change the administrator password and remove the demo accounts.
5. Run a penetration test and a role-permission test (all 8 roles) before go-live.
6. Handle personal data in line with Ethiopia's Personal Data Protection Proclamation No. 1321/2024, and define who may export data.
7. Put the server behind a firewall, and add a web application firewall if it is exposed to the internet.

---

## 10. Notifications and integrations

### 10.1 Notification events

| Event | Default channels |
|---|---|
| Report submitted, verified, approved or returned | In-system, email |
| Performance alert (below threshold) | In-system, SMS, email |
| Corrective action plan created | In-system, email |
| Targets proposed; targets approved or returned | In-system, email |
| Employee result reported or verified | In-system, email |
| Escalation | In-system, SMS, email |
| Sign-in verification code | SMS only |

- Each user can opt out of SMS and email in **My profile**.
- SMS and email are **held in the outbox** until an administrator ticks "Integration and cost approved" for that channel. Held messages are then released.
- Delivery uses generic HTTP JSON gateways configured in `.env`.
- One-time codes are never stored in readable form.

### 10.2 Public REST API
The endpoints are listed in the README and at `/api/v1/openapi.json`. Planned integrations are listed on the Integrations page:

| System | KPIs fed |
|---|---|
| Revenue system | REV-01 |
| Land information system | LAND-01, LAND-03 |
| e-Trade licensing | TRADE-01 |
| DHIS2 | HEALTH-01, HEALTH-02 |
| IFMIS | INFRA-03 |

Submissions received through the API go through the same verification and approval workflow as reports entered by hand.

### 10.3 Webhooks
Active webhooks receive a JSON POST for the events they subscribe to: `{event, at, data}`, signed with an `X-Shaggar-Signature: sha256=<HMAC>` header.

### 10.4 AI providers

| Provider | Setting | Notes |
|---|---|---|
| Claude API | `ANTHROPIC_API_KEY` | Uses tool calling; paid per use |
| Ollama (self-hosted) | `OLLAMA_URL` | A summary of scoped data is sent with each question; free licence, needs hardware |
| None | — | Built-in rule-based answers |

Data sent to an external provider is limited to the requesting user's scope. The City should approve the provider before enabling it.

---

## 11. Backup, recovery and retention

### 11.1 Backups
- **Automatic:** one backup per day, a consistent full copy taken with `VACUUM INTO`.
- **Manual:** from the Backup & retention page.
- **Safety:** taken automatically before every restore.
- Each backup has a SHA-256 checksum, which can be re-checked with **Verify**.
- The newest *N* backups are kept (default 14).
- **Download** produces an AES-256-GCM encrypted file protected by a passphrase. **Restore from file** decrypts and checks it before replacing the data.
- A restore keeps the backup index, signs out other users and is audited.

### 11.2 Recommended production procedure
- Nightly backup, with the `storage/backups` folder copied off-site weekly.
- Recovery point objective: 24 hours with the built-in backup. Add disk snapshots or file replication for 15 minutes.
- Recovery time objective: 4 hours.
- A restore drill every quarter, recorded under Quality & testing.

### 11.3 Retention (defaults, configurable; to be approved by the records management office)

| Record | Kept active | Then |
|---|---|---|
| Audit trail | 7 years | Deleted |
| Completed action plans | 90 days after completion | Archived (restorable) |
| Notifications | 90 days | Deleted |
| SMS and email outbox | 30 days | Deleted |
| Expired sessions and codes | At expiry | Deleted |
| Backups | Newest 14 | Oldest deleted |

---

## 12. Languages, accessibility, performance and testing

- **Languages:**
  - English, Afaan Oromoo and Amharic can be switched on the sign-in page, in the top bar or in My profile. The choice is saved per user.
  - Translated: menus, page titles, statuses, the period selector and the sign-in page.
  - The Amharic font is Noto Sans Ethiopic.
  - Translations are drafts. They must be reviewed and approved, and the remaining text translated, before go-live.
- **Accessibility:**
  - target WCAG 2.2 AA
  - labelled fields and named buttons
  - keyboard access throughout (table rows open with Enter; Esc closes dialogs; Ctrl+K opens search)
  - visible focus rings
  - status shown with icon + label, never colour alone
  - charts with text descriptions
  - reduced motion respected
  - text contrast of at least 4.5 : 1, checked automatically
- **Responsive:** sidebar becomes a drawer on phones; wide tables scroll; the hero becomes bar rows on small screens.
- **Performance:** every screen renders in under 300 ms in the browser (measured by the built-in check). The bootstrap payload is about 75 KB for the sample city. The audit trail is paged on the server.
- **Automated tests:** `npm test` (7 end-to-end API scenarios) and the in-app accessibility and performance checks.
- **Pre-go-live test plan** (also in the app):
  1. accessibility review with a screen reader
  2. usability sessions with 5 or more users per role
  3. load test with 200 concurrent users
  4. device testing on browsers, Android phones and tablets
  5. security testing
  6. restore drill

---

## 13. Sample accounts and demonstration script

The password for all accounts is **`Shaggar@2026`**. With `DEMO_MODE=true` the 2-step code is shown on screen.

| Username | Role | Scope | 2-step |
|---|---|---|---|
| `tolera.g` | Super Administrator | City-wide | ✓ |
| `mayor` | Mayor | City-wide | ✓ |
| `chaltu.b` | Mayor's Office Administrator | City-wide | ✓ |
| `gemechis.t` | Department Head | Revenue | ✓ |
| `lalise.f` | Department Head | Land | ✓ |
| `bontu.a` | Department Head | Job Creation | ✓ |
| `dawit.h` | Department Head | Trade | ✓ |
| `kedir.m` | Department Head | Infrastructure | ✓ |
| `hawi.t` | Department Head | Health | ✓ |
| `meron.a` | KPI Officer | City-wide (central M&E) | |
| `ifa.g` | KPI Officer | Revenue | |
| `sena.o` | Department Staff | Land | |
| `robsan.d` | Department Staff | Revenue | |
| `abdi.w` | Auditor / Reviewer | City-wide, read-only | ✓ |

**Sample data** (illustrative):
- 6 departments, 5 strategic objectives and 18 KPIs with FY 2026/27 targets
- July–September results approved; October results at mixed workflow stages
- last year's quarterly results
- 18 employees and 2 corrective action plans

**Demonstration script (about 15 minutes):**
1. **Mayor (`mayor`).** On the dashboard, Infrastructure is lowest. Open its scorecard and plan CAP-2026-001. Ask the AI assistant "Which departments need my attention?".
2. **KPI Officer (`meron.a`).** In Reporting & approvals, submit the overdue October INFRA-01 report with a PDF. A short narrative is refused, and is accepted once the explanation is long enough.
3. **Department Head (`kedir.m`).** Verify the report. Try returning another report with a reason.
4. **Mayor's Office Administrator (`chaltu.b`).** Approve the report and watch the scorecard change.
5. **Auditor (`abdi.w`).** In the audit trail, filter by Approval and export to CSV.
6. **Administrator (`tolera.g`).** Change the name and logo, create a backup and verify it, create an API key and call it from the console, then run the quality checks.

---

## 14. Administration procedures

### 14.1 New staff member
1. Go to **Users & access** and choose **Add user**.
2. Enter the name, username, role, department, phone and email.
3. Save, then hand over the temporary password securely. The user must change it at first sign-in.
4. Assigning the Department Head role makes that person the department's head.

### 14.2 Staff member leaves
Edit the user, set the account to **Disabled** (their sessions end at once), and reassign their KPIs.

### 14.3 New fiscal year
1. Take and download a backup.
2. In **Settings**, set the fiscal year labels and start year, and set the reporting month to July.
3. Review the KPIs and weights in the KPI library.
4. Enter the annual targets and distribute them under **Targets**.
5. Load last year's results into `kpi_prev_year`, by script or through the API.

### 14.4 Add a KPI
1. In the **KPI library**, choose **Define KPI** and complete every field.
2. Rebalance the department's weights so they total 100%.
3. Refine the monthly targets under **Targets**.

### 14.5 Change name or logo
Go to **Settings → System settings → Name & logo** (README, "Changing the name and logo").

### 14.6 Enable SMS
1. Agree the gateway and its cost.
2. Set `SMS_GATEWAY_URL` and `SMS_GATEWAY_TOKEN` and restart the server.
3. Under **Notifications → Channels & rules**, tick "approved" for SMS. Held messages are released.
4. Set `DEMO_MODE=false`.

### 14.7 Restore after an incident
1. Under **Backup & retention**, choose the restore point, **Verify** it, then **Restore**.
2. Check sign-in, the scorecards and the audit trail.
3. Write the incident review within 5 working days.

---

## 15. Known limitations and roadmap

| Item | Current state | Next step |
|---|---|---|
| Translations | Menus, titles, statuses and sign-in are translated, as drafts | Full translation and approval by the City's language committee |
| SMS and email | Generic HTTP gateway adapter; held until approved | Connect the chosen provider (e.g. the Ethio telecom bulk SMS API) |
| Database | SQLite (single server) | Move to PostgreSQL for clustering or high availability |
| Single sign-on | Local accounts with 2-step codes | Connect to the City directory (LDAP/AD, OpenID Connect) |
| Reports | On screen, with CSV copy | PDF export with letterhead; scheduled email reports |
| Mobile | Responsive web | Installable app (PWA) for offline submission |

---

## Appendix A — Permission matrix (defaults)

| Permission | Super Admin | Mayor | Mayor's Office Admin | Dept Head | Staff | KPI Officer | Auditor |
|---|---|---|---|---|---|---|---|
| View dashboards & scorecards | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |
| See all departments | ✓ | ✓ | ✓ | | | | ✓ |
| Define & edit KPIs | ✓ | | | | | | |
| Set targets | ✓ | | | | | | |
| Submit performance data | ✓ | | | | | ✓ | |
| Verify submissions | ✓ | | | ✓ | | | |
| Approve submissions | ✓ | ✓ | ✓ | | | | |
| Corrective action plans | ✓ | | | ✓ | | | |
| Evaluate employees | ✓ | | | ✓ | | | |
| View & export reports | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |
| View audit trail | ✓ | ✓ | | | | | ✓ |
| Manage users & permissions | ✓ | | | | | | |
| System configuration | ✓ | | | | | | |
| Export records (CSV) | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |
| Use the AI assistant | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |

KPI Officers with no department act city-wide (central M&E).

## Appendix B — Glossary

| Term | Meaning |
|---|---|
| **KPI** | Key performance indicator: a measurable result with a formula and target |
| **Achievement** | Actual compared with target, as a percentage (§5.2) |
| **Weight** | A KPI's share of its department's score; weights total 100% |
| **Cap** | The maximum achievement counted in scores (default 120%) |
| **Provisional** | Data submitted or verified but not yet approved |
| **CAP** | Corrective action plan |
| **Escalation** | Automatic notification to a higher level when work is late |
| **EFY** | Ethiopian fiscal year (2019 EFY = 2026/27) |
| **2-step sign-in** | Password plus a one-time code sent by SMS |
| **Scope** | The departments whose data a user can see |
