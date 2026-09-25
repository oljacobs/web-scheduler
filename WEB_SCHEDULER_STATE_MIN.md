# Web Scheduler — Living State Reference

Last updated: 2026-09-24

## Use this first

This is the short, current prompt reference for the live scheduler. Read it before
inspecting code. Then read `AI_STATE_MIN.txt` only for the part of the scheduler
being changed. `AI_STATE_SUMMARY.txt`, `HANDOFF_2026-09-16.md`, and
`SPEC_2026-09-06-staffing-accountability.md` are supporting/historical documents,
not current build instructions unless this file says otherwise.

## Active system

- SPA: `/Users/orenj/Documents/GitHub/web-scheduler`; vanilla JavaScript, no bundler;
  deployed at `schedule.d7fr.org`.
- Backend: `/Users/orenj/Desktop/fdchecklist-trial_1/scheduler`; Django API at
  `https://checklist.d7fr.org/api/scheduler/` with Railway PostgreSQL.
- Auth: Microsoft Entra/MSAL. Production persistence is the authenticated Django API.
  Supabase is legacy fallback only when `APP_CONFIG.schedulerApiUrl` is blank.
- Do not use the old prototype at `/Users/orenj/Documents/Claude/Projects/Scheduling App`.

## Live and verified

- Partial tours, time off, and staffing coverage are live.
- Admin/light-duty scheduling and the current employee roster are live.
- Pay-code entry/confirmation and the printable schedule are live.
- Bug reporting is live.
- The primary current workstream is checklists/maintenance QA; do scheduler work only when it
  supports operations staffing, payroll/reporting, fleet/qualification truth, or bug routing.

## Rules that must not change

- Railway PostgreSQL/Django API is the source of truth; do not reintroduce production Supabase writes.
- Use America/Chicago and the 0800 shift-day rollover; never use bare UTC dates for staffing logic.
- Apparatus have no platoon. The date determines the operational platoon on duty.
- `ADMIN` is a non-rotating roster grouping; `admin` is a person-held qualification. Neither is
  eligible for mandatory force logic.
- Admin units use their own Mon–Thu, 0800–1800 tour shape and are excluded from operations board,
  overtime/trade boards, staffing alerts, and normal operations printouts.
- Assignments can be partial. `_start`/`_end` are minutes from the unit tour start; a whole tour
  sends neither. Compare cross-unit blocks in absolute minutes and treat intervals as half-open.
- A seat is covered by all of its blocks. Use `covered` and tour-gap logic, never only the first
  person listed on a seat.
- PTO/SICK/FMLA absence rows retain payroll hours but cover no seat. LTD is derived from light-duty
  dates and is not a selectable absence reason.
- Pay codes are per assignment block and are the approved payroll vocabulary. Do not invent a
  separate overtime-cause taxonomy without an explicit decision.
- Keep staff/medical data minimal: light-duty notes are operational only, no diagnosis; do not add
  individual salary data to the scheduler.

## State/API safeguards

- `applyPersistedState()` is an allowlist: any new API state key must be explicitly copied into
  client state or it disappears after load.
- Do not place unbounded history in the whole-state PUT. Use targeted API endpoints for reports,
  snapshots, or other growing data sets.
- Stored audit/notification text must use safe fallbacks such as `unitLabel()`; never persist an
  unresolved lookup as `undefined`.
- New writes must preserve current Django authorization, CSRF/session or bearer-token protections,
  server-side validation, auditability, and existing role boundaries.

## Current documentation status

- `AI_STATE_MIN.txt` is the detailed implementation contract and gotcha list.
- `BACKLOG.md` contains useful work ideas but includes stale entries that are already shipped.
- `SPEC_2026-09-06-staffing-accountability.md` is an early design document. Its Phase 0 and much
  of its leave/payroll groundwork are already shipped or superseded by the current implementation.
- **Required documentation task:** reconcile/consolidate
  `SPEC_2026-09-06-staffing-accountability.md` and this file before using the spec for a build.
  Preserve unresolved accountability decisions, mark shipped/superseded items, and move the final
  open list into `BACKLOG.md`. Do not silently delete business requirements.

## Verified shipped work

- **P1 callback availability — shipped and verified:** the visible mandatory list is replaced with
  a callback list. Members
  submit date-span availability in configurable officer-managed horizons (initial presets:
  14, 21, or 30 days). Availability is not tied to a rig or seat; when a voluntary OT opening does
  not fill in time, officers filter the callback list by the real seat qualification and conflicts.
  Members may view/edit only their own availability; officers, including ride-up officers, may view
  and use the list. Calling records accepted/declined/no-answer/unavailable outcomes; notes are
  optional so the field workflow remains quick. Keep normal voluntary-OT notification email routes;
  hide the mandatory UI and deactivate only mandatory/forced email routes without deleting history.
  **Bin 1:**
  `SCHEDULER_MANDATORY_BACKFILL_ENABLED` defaults to false; the API hides existing mandatory
  picks without deleting them, cached clients cannot create forced posts/assignments, and the
  sender marks queued mandatory-overtime emails skipped. Do not enable this flag without an
  explicit decision to restore the retired flow.
  **Bin 2:** `CallbackAvailabilitySettings` is a
  one-row, server-owned setting with only 14/21/30-day choices (21 default). Every authenticated
  member may read the current window; only officers, including ride-up officers, may change it via
  the targeted `callback-settings/` API. The change records the acting officer and an audit entry.
  It is deliberately outside the broad `/state/` PUT, which must never be used for member-owned
  callback availability or other restricted scheduler writes.
  **Bins 3–6:** members create and withdraw only
  their own non-overlapping Central-time availability date spans inside the selected horizon.
  Each submitted date is a full 0800–0800 shift day; the member UI does not ask for times. Officers
  default their callback search to the same full shift day and may reveal specific hours only when
  needed. Scheduled assignments are excluded. Officers record accepted/declined/no-answer/
  unavailable outcomes with an optional note. Accepting against an open overtime post adds the
  member to that post's existing applicant list; it does not bypass the current officer award
  process or alter voluntary-OT notifications. Every outcome is retained as a
  `CallbackContactAttempt` PostgreSQL row; officers can review the latest 100 entries under
  Admin → Callback → Callback history after a page reload.
  **Bin 7 coverage:** member ownership, withdrawal, duplicate/overlap prevention, callback settings
  authorization, and mandatory-email retirement are covered; the officer and phone flows are verified.
- **Suite branding — shipped and verified:** the scheduler now reads as
  one product, while preserving scheduler-specific dense staffing workflows and accessibility.
  **Bins 10–11:** scheduler uses the checklist
  suite's navy surfaces, gold primary actions/active states, `Inter` body type, and `Barlow
  Condensed` operational headings. Apparatus-type and staffing-status colors remain unchanged so
  the visual refresh does not conceal operational meaning. The scheduler masthead now mirrors the
  checklist header with the D7FR scramble, district hierarchy, and red-to-gold rule. Account access,
  Schedule/Admin, and compact Tools/Print/Email controls are all in that full-width masthead; the
  former sign-in sidebar is removed so the schedule uses one responsive content column.
  **Bin 12:** phone, tablet, desktop, keyboard focus, contrast, empty/error states, and print output
  were verified after deployment.

## Remaining work bins

1. **P2 — Printable shift sheet:** replace the live-page printout with a dedicated 48-hour sheet,
   including selected units, crew, pay codes, and notes.
2. **P2 — App/IT feedback:** add scheduler-side feedback capture that records the page and signed-in
   reporter context.
3. **P2 — Staffing accountability:** add immutable staffing snapshots and QA/accountability reporting
   using approved pay-code vocabulary. Capture on publish, at the 08:00 shift start, and nightly;
   send the staffing email only once per 24 hours at 08:00.
4. **P2 — Paycom readiness:** complete Paycom discovery before deciding required-comment enforcement,
   uncertain code visibility, or any payroll export.
5. **P2 — Rescue display order:** Heavy Rescue uses Officer → Engineer → Firefighter 1 → Firefighter 2;
   replace the visible “Driver/Engineer” label with “Engineer” everywhere. Attack and Brush are wildland
   apparatus, not Rescue.
6. **P3 — Vocabulary cleanup:** replace visible “platoon” wording with A/B/C Shift only; do not rename
   internal fields, API values, or database data.

## Open operations decisions

- Confirm whether SICK and FMLA are chief-entered or HR-entered, whether admin needs one shared light-duty
  unit or named posts, and callback ranking/cycle/decline policy.
- Confirm and test a Railway PostgreSQL backup/restore process.
- Mandatory escalation is retired and must not be built or re-enabled without an explicit leadership decision.

## Prompt discipline

1. Read this file, then the relevant section of `AI_STATE_MIN.txt`.
2. Verify the named active code path before changing it; do not scan the whole repo by default.
3. Treat every client value as untrusted and protect object/role access on the Django side.
4. Update this file and the detailed state file when state shape, permissions, data ownership, or
   operational behavior changes.
