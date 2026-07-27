# D7FR Crew Scheduler Trial

A vanilla-JS SPA (no build step) for fire department scheduling, deployed static to Vercel at `schedule.d7fr.org`.

## Current architecture (as of 2026-07 — updated)

- **Auth:** Microsoft Entra ID (MSAL.js) — the old PIN login is gone.
- **Backend:** the app now reads/writes a **Django REST API** on Railway
  (`checklist.d7fr.org/api/scheduler/`), which stores data in real Postgres tables.
  It sends the user's Entra token as a Bearer credential. Set via
  `APP_CONFIG.schedulerApiUrl` + `schedulerApiScopes` in `config.js`.
  **Supabase is legacy fallback only** (used only if `schedulerApiUrl` is blank).
- The Django backend lives in the sibling `fdchecklist` repo (`scheduler/` app).
  See that repo's `SCHEDULER_BACKEND.md` and `PROJECT_STATE.md` for the full picture.
- **AI context:** `AI_STATE_MIN.txt` (compact, current) and `AI_STATE_SUMMARY.txt`.
  Update them when `app.js` changes state shapes/enums/flow (pre-commit hook enforces this).

Persistence still falls back to `localStorage` when offline. Legacy notes below
describe the original trial (PIN login, Supabase blob) and are kept for history.

## Included In This Trial

- Daily, weekly, and monthly schedule views
- 48/96 `AA/BB/CC` rotation logic
- Capability-based seat staffing (rank-derived certs + per-person ride-up grants)
- Front-line vs reserve apparatus: 8 units run daily in a fixed board order,
  the rest are on-demand and placed in service per date from the Tools drawer
- Per-platoon **staffing templates** with a preview-and-push out to 6 months;
  hand-edited days are never overwritten
- Unit visibility toggles for reserve or out-of-service apparatus
- Supervisor staffing edits from phone or laptop
- CSV import for employees and units with preview and validation
- Separate admin workspace for employees, imports, and units
- Employee archive / restore workflow with credential editing
- Shift trade requests with supervisor approval or denial
- Open overtime shifts with first-come approval flow
- Draft vs published schedule state
- Notification center — **display only, no email is actually sent** (see Known gaps)
- Audit log, with full-history CSV export
- Print and PDF-friendly output
- Shared persistence through Supabase when configured

## Known gaps (read before a department pilot)

- **Email is not implemented.** There is no `EMAIL_BACKEND`, no `send_mail`, and no
  SMTP config anywhere in either repo. `createNotification()` only appends a row to
  an in-app list labelled "Email notification". Messages such as *"Eligible off-duty
  employees notified by email"* are literally untrue — nobody is notified. This is a
  feature to build, not a bug to test.
- **Trades require a partner.** `createTradeRequest()` rejects a request with no
  partner (`if (!ownerId || !partnerId || ownerId === partnerId) return;`) and does
  so with a bare `return` — no message, the form just silently does nothing. There is
  no way to give away a day and bank the time for later payback.
- **Open shift posts fabricate applicants.** `createOpenShift()` seeds the first three
  available off-duty employees as applicants who never applied. Demo behaviour left in
  a production path; in an overtime context it shows people as volunteering when they
  did not.
- The whole-state `PUT /api/scheduler/state/` saves the entire application on every
  change. It is now guarded (capped history, prune guard) but not redesigned; targeted
  writes are the real fix.

## Files

- `index.html`: app structure
- `styles.css`: responsive navy-themed design
- `app.js`: sample data and scheduling logic
- `config.js`: place your Supabase URL and anon key here for deployment
- `supabase-schema.sql`: SQL to create the persistence table and policies

## Trial Login Notes

- Employee PINs rotate through `1111`, `2222`, `3333`, `4444`, `5555`, and `6666`
- Supervisor PIN is `9000`
- This is only for prototype testing and should be replaced by real authentication before production use

## Local Testing

Because this is a static site, you can test it by opening `index.html` directly in a browser. If you want a local web server instead:

1. Open Terminal in this folder.
2. Run `python3 -m http.server 8080`
3. Visit `http://localhost:8080`

## Supabase Setup

This version can persist data across refreshes and devices when connected to Supabase.

### 1. Create the table

In the Supabase SQL editor, run the contents of [supabase-schema.sql](/Users/orenj/Documents/New%20project/supabase-schema.sql).

### 2. Add your project values

Open [config.js](/Users/orenj/Documents/New%20project/config.js) and replace:

- `supabaseUrl`
- `supabaseAnonKey`

with your real project values.

### 3. Deploy to Vercel

Re-deploy the updated files to Vercel after saving `config.js`.

### 4. Verify the status pill

At the top of the app you should see:

- `Connected to Supabase`

If Supabase is not reachable, the app will fall back to browser-only storage.

## CSV Import

Supervisor login is required before imports can be previewed or applied.

### Employee CSV columns

- `id`
- `name`
- `shift`
- `title`
- `certs`
- `pin`
- `email`
- `isSupervisor`
- `status`

Example cert format:

- `emt|paramedic`
- `officer|emt`

### Unit CSV columns

- `id`
- `name`
- `type`
- `minStaff`
- `requiredCerts` (vestigial for typed units — alerts come from the seat layout)
- `onDemand` (`true` = reserve, only runs on dates it is placed in service)
- `sortOrder` (board order; front-line units are 1-8, reserves default to 100)
- `visible`

There is no `shift` column — apparatus have no platoon. Whichever platoon (A/B/C)
is on duty for a date staffs whatever is running that day.

Example required cert format:

- `paramedic`
- `officer|emt`

### Import behavior

- Preview runs before apply
- Errors block import
- Warnings allow import but should be reviewed
- Matching `id` values update existing records
- New `id` values create new records
- Schedule assignments are preserved where possible and missing dates or units are filled in
- Employee `status` supports `active` and `archived`

## AI Agent Context Files

These files provide a compact app-state map for future AI sessions:

- `AI_STATE_SUMMARY.txt` (detailed but compact)
- `AI_STATE_MIN.txt` (ultra-compact preload)

Update both whenever `app.js` changes any of:

- state keys/shapes
- entity fields
- enums/constants
- startup/persistence/migration flow

### Keep them enforced with a pre-commit hook

1. Enable repo-managed hooks:
   - `git config core.hooksPath .githooks`
2. Ensure hook scripts are executable:
   - `chmod +x .githooks/pre-commit scripts/check-ai-state-summary.sh`

What this hook does:

- If `app.js` is staged, it blocks commit unless at least one of:
  - `AI_STATE_SUMMARY.txt`
  - `AI_STATE_MIN.txt`
  is also staged.

## Easiest Free Deployment Path

I recommend deploying this trial to a subdomain like `schedule.d7fr.org`.

### Option A: Cloudflare Pages

This is a strong fit if your DNS is already managed in Cloudflare.

1. Create a GitHub repository and upload these files.
2. In Cloudflare, open `Workers & Pages`.
3. Create a new Pages project from that GitHub repo.
4. Use these settings:
   - Build command: leave blank
   - Build output directory: `/`
5. After deployment, add a custom domain such as `schedule.d7fr.org`.
6. In your DNS, point the subdomain to the Pages project as Cloudflare instructs.

### Option B: Vercel

This is also free for a simple trial and easy to connect to GitHub.

1. Create a GitHub repository and upload these files.
2. Import the repo into Vercel.
3. Framework preset can stay `Other`.
4. Build command can stay empty.
5. Output directory can stay empty.
6. Add the custom domain `schedule.d7fr.org` in the project settings.
7. Update the DNS record for that subdomain as Vercel instructs.

## Recommended Next Phase

When the trial proves useful, the next upgrade should be:

1. Replace shared JSON persistence with normalized database tables
2. Replace PIN login with real department accounts
3. Add actual email sending
4. Add optional SMS notifications
5. Add richer schedule editing and approvals
6. Add a proper employee directory and credentials admin screen

## Production Reality Check

Even if the schedule itself can be mostly public later, supervisor edits and approvals should stay protected. This prototype keeps the workflow simple, but a production version should use real authentication and stored audit history.
