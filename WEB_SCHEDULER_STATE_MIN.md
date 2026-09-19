# Web Scheduler State Min

Last updated: 2026-09-18

Purpose: compact preload for future AI sessions. This is separate from the existing `AI_STATE_MIN.txt`.

## Active path

- Active scheduler SPA: `/Users/orenj/Documents/GitHub/web-scheduler`
- Backend API: `/Users/orenj/Desktop/fdchecklist-trial_1/scheduler`
- Ignore old prototype: `/Users/orenj/Documents/Claude/Projects/Scheduling App`

## Architecture

- Vanilla JS SPA, no bundler, deployed static at `schedule.d7fr.org`.
- Auth uses Microsoft Entra / MSAL.
- Production persistence uses Django API at `https://checklist.d7fr.org/api/scheduler/`.
- Supabase is legacy fallback only when `APP_CONFIG.schedulerApiUrl` is blank.
- Backend state lives in the main Django project's `scheduler/` app.

## Current production truth from Oren

The following are implemented, tested, and working:

- Time off / partial-day staffing.
- Admin panel, light-duty staffing, updated employee roster, admin qualification.
- Pay-code confirmation.
- Printable daily schedule with apparatus selector and pay codes included.
- Bug reporting.

If older `README.md` or `BACKLOG.md` says these are unbuilt or only partly built, treat that as stale until code confirms otherwise. The existing `AI_STATE_MIN.txt` and `AI_STATE_SUMMARY.txt` contain detailed current scheduler contracts and should still be read for scheduler work.

## Core concepts to preserve

- Apparatus do not belong to a platoon; the date determines the platoon on duty.
- Front-line units run daily; reserve/on-demand units activate by date.
- Board order must be stable and explicit, not array-order dependent.
- Staffing is capability-based: officer, engineer, paramedic, EMT, admin, plus ride-up grants.
- ADMIN is a roster grouping/platoon sentinel and `admin` is a person-held capability. ADMIN never rotates, never becomes the on-duty platoon, and is never eligible for mandatory force logic.
- Admin units have `scheduleClass="admin"` and separate tour rules. They are deliberately excluded from operations board, overtime board, trade board, staffing alerts, and normal operations printouts.
- A tour is not always 24 hours and an assignment is not always the whole day. Assignments can carry `_start`/`_end` minutes from the unit tour start.
- A seat can be covered by multiple people across a tour. Use seat `covered`/gap logic, not only the first `person`.
- Absence rows keep payroll hours but cover no seat. PTO/SICK/FMLA are explicit; LTD is derived light duty.
- Pay codes are payroll vocabulary and should not be replaced by a separate cause taxonomy.
- Pay codes are per assignment block, so block-aware updates matter when someone works split hours.
- Whole-state PUT exists historically; avoid expanding unbounded state. Prefer targeted writes for new complex workflows.
- Date logic is America/Chicago and shift day rolls at 0800.

## Current caution areas

- Existing long-form docs may be stale relative to Oren's latest tested features; `AI_STATE_MIN.txt` is the detailed scheduler contract.
- Before building scheduler features, verify active code paths in `app.js`, `index.html`, and `styles.css`, but avoid broad repo scans.
- If changing state shape, update this file and the existing AI context files as appropriate.

## Likely next scheduler work

Scheduler is not the immediate bottleneck compared with maintenance/checklist updates.
Only prioritize scheduler work if it supports:

- maintenance/fleet reporting,
- payroll export/reporting,
- fleet roster/qualification truth; note the full fleet roster lives in the Django app under `/maintenance/fleet/` via `checklists/urls.py` and `checklists/fleet_master.py`,
- bug-report routing,
- or operational staffing reports.

## Efficient future-agent rules

- Read this file and `AI_STATE_MIN.txt` before code inspection.
- Do not inspect the old prototype scheduler folder.
- Do not run broad search across the repo unless a ticket requires it.
- For implementation, inspect only the named surfaces for the ticket.
