# D7FR Crew Scheduler Trial

This is a lightweight static prototype for a fire department scheduling app. It is designed to run free during trial testing and can be deployed to a subdomain such as `schedule.d7fr.org`.

It now supports two persistence modes:

- Browser fallback with `localStorage`
- Shared remote persistence through Supabase using a single JSON state record

## Included In This Trial

- Daily, weekly, and monthly schedule views
- 48/96 `AA/BB/CC` rotation logic
- Unit staffing rules and medic coverage alerts
- Unit visibility toggles for reserve or out-of-service apparatus
- Supervisor staffing edits from phone or laptop
- Employee PIN sign-in flow
- CSV import for employees and units with preview and validation
- Separate admin workspace for employees, imports, and units
- Employee archive / restore workflow with credential editing
- Shift trade requests with supervisor approval or denial
- Open overtime shifts with first-come approval flow
- Draft vs published schedule state
- Notification center with email-first workflow and SMS-ready placeholder
- Audit log
- Print and PDF-friendly output
- Shared persistence through Supabase when configured

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
- `requiredCerts`
- `shift`
- `visible`

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
