# Scheduler backlog

> **Needs reconciliation before use.** `WEB_SCHEDULER_STATE_MIN.md` is the current
> scheduler reference. This backlog retains useful ideas but includes shipped and
> superseded entries; reconcile it with `SPEC_2026-09-06-staffing-accountability.md`
> before treating an item as active work.

Single list for the scheduler (SPA + the `scheduler/` Django app). Reconciled
2026-09-06 against Oren's own list — items already specified elsewhere are
cross-referenced, not restated. Design detail for the accountability work lives in
`SPEC_2026-09-06-staffing-accountability.md`; this is the ordered backlog.

## Shipped

- **Phase 0 — `OvertimePost.forced` persists** (migration `0011_overtime_forced`).
  The SPA had always set it; the serializer did not list it, so it was dropped on
  every save and a forced hire looked identical to a volunteer. Coverage rows badge
  Forced vs Awarded.
- E118 / M118 / HR115 scheduler Units imported and confirmed; HR115 is on-demand.

- **§1 Time off and partial-day staffing — BUILT** (2026-09-16, migrations
  `0013`–`0019`). See below for what shipped and what is still open.

---

## 1. Time off and partial-day staffing — SHIPPED

Built 2026-09-16. `AI_STATE_MIN.txt` carries the mechanics; this records the
decisions, because several of them differ from what was originally sketched here.

**Partial tours.** `Assignment.start_minute`/`end_minute`, measured in minutes from
the *unit's* tour start rather than as datetimes. A full tour is `0..tour_minutes`
and nothing wraps midnight, which removed every midnight edge case the datetime
approach would have carried. `unique_together` became
`(employee, unit, date, start_minute)` — the old 3-tuple made split coverage
impossible at the schema level, and the state-save dedupe key had the same bug.

**A seat is covered by a LIST of people, not one.** "First 4 on, another chief takes
the last 20" is one seat filled by two. `assignPeopleToSeats` returns seats carrying
`people[]`, `gaps[]` and `covered`.

**The answer to the open question above: a partially covered required seat is STILL
SHORT.** Twelve of twenty-four hours does not count as covered; the alert names the
uncovered window and the rig does not read "Staffed". Trade legality and the
overtime board use the same rule.

**Absences.** `absence_code` (`PTO`/`SICK`/`FMLA`/`LTD`) + note + `absence_no_backfill`.
An absence block **keeps its hours for payroll but covers no seat** — that is what
makes minimum staffing honest. An "Off this tour" roster under the seats says who is
off and why, so the board answers "is this rig staffed" and "where is everybody"
separately rather than conflating them.

**The backfill prompt has no default.** As specified: a decision, never automatic.
Answering "no" leaves the seat visibly short but keeps the hours off the overtime
board, and that choice is a real column, not something re-derived.

**Date ranges.** Time off is entered once across a range and expands to one row per
tour, so a 48 stays two rows and payroll reads the hours right. It only touches
dates the person was already scheduled on that unit — a date they were never on is
skipped and counted, never invented.

**`LTD` is Light Duty, not long-term disability.** It is never picked from the
dropdown: it is derived live from `Employee.light_duty_start`/`_end`, so changing or
closing the range updates every affected tour with no re-entry. Its payroll is
entered by admin. Light duty vacates operations seats the member was *already*
assigned to — blocking the pickers alone left rigs reading as staffed by somebody
who was off for two months.

Still open on this section:
- Confirm `SICK` and `FMLA` are chief-entered rather than HR-entered like `LTD`.
- Whether a partially covered *optional* rider seat should surface anywhere.

## 2. Pay codes on the board

**Mostly BUILT.** Source: `Paycom Labor Distribution Sheet 2026.01`.

Done: `PayCode` model + migration 0012, `seed_pay_codes` (24 codes live on Railway),
`_pay`/`_payNote`/`_payFor` round-trip through `/api/scheduler/state/`, the seat-row
picker with prompt-labelled comment and roster picker, and pay codes on the printed
sheet. Remaining is the one confirmation at the bottom of this section, plus deciding
whether a required comment left blank should BLOCK publishing (today it only shows
red on the field).

- Show the pay code against a person on a rig, on the daily board and the printed
  schedule.
- HR-assigned-only codes are EXCLUDED from the scheduler: `100`, `200`, `ACADEMY`,
  `ADMMTG`, `ASH`, `BSH`, `CSH`, `DISC`, `FMLA`, `LTD`, `MNT`, and `TSHR` (HR-only
  in substance — hours left off timesheets).
- That leaves ~24 selectable codes in five groups: Agency Activation (`BCSTW`,
  `BCSTWBF`, `EMREP`, `ERC`, `MINSTAFF`, `STR`, `SWX`), Deployment (`EMTF`,
  `EMTFBF`, `EOC`, `EOCBF`, `TIFMAS`, `TIFMASBF`, `TIFMASEMAC`, `TIFMASEMACBF`,
  `TXTF1`, `TXTF1BF`), Training (`EMST`, `FTR`, `PARACRED`, `SPOT`), Military
  (`MIL`), Special Events (`VTO`, `VTOBF`).
- **Most codes require a comment, and the sheet says what KIND** — four prompts:
  *What and where*, *For who*, *Incident ID*, *Reason*. Store the prompt with the
  code and change the field label accordingly, rather than one generic "notes" box.
  Only `STR` and `VTO` require no comment.
- **"For who" is every backfill code, and the scheduler already knows who.** Make
  that comment a person picker rather than free text, so a backfill row is LINKED
  to the member it covers instead of naming them in prose. That relationship is
  what makes deployment reimbursement reportable.
- Confirm: the sheet's Status column reads blank rather than "Visible" for `EOCBF`
  and `TIFMASEMACBF`. Probably a PDF extraction artefact — check before excluding.

**Reconciliation worth noting:** these pay codes ARE the "why" the Asst. Chief asked
for in question 3 of the spec. `MINSTAFF`, `EMREP`, `ERC`, the deployment codes —
the department already has a controlled vocabulary for why someone is on a rig, and
it is the one payroll uses. **Do not invent the cause taxonomy in the spec's §3.
Use these codes.** That makes the QA/QI report reconcile with payroll by
construction instead of by mapping.

## 2b. Admin / light-duty scheduling — SHIPPED

Built 2026-09-16 alongside §1, and the reason the tour shape moved onto the unit.

- `Unit.schedule_class` (`operations`|`admin`), `tour_start_hour`, `tour_minutes`,
  `weekdays[]`. Admin = 0800–1800, Mon–Thu. Nothing hard-codes 1440 any more.
- Admin units are **deliberately excluded** from the daily operations board, the
  printed sheet, staffing alerts, and the overtime and trade boards. They are
  constant and follow none of the operations rules — no platoon, no mandatory
  overtime, no PTO tour limits. They get their own "Admin" view.
- `ADMIN` platoon and an `admin` qualification, so admin pick lists are not the
  whole department. The qualification is person-held and merged forward on roster
  re-import; the platoon never rotates and can never be forced by the 72-hour rule.
- Templates: a rig's standing crew is keyed by platoon, an admin position's by a
  single Mon–Thu key, so the two can never be mistaken for each other on a push.

Still open:
- Whether admin is one shared "Light Duty" unit (6 slots is right) or several named
  posts (one unit each, so the board says *where* people are).
- `admin` currently sits in the Credentials checkbox grid beside paramedic/EMT/
  engineer/officer. Could be its own toggle beside "Supervisor access".

## 3. Printable daily schedule

**New.** Today the print button is `window.print()` against the live page, plus two
`@media print` blocks in `styles.css`. That prints whatever is on screen.

Wanted: a **48-hour window on one page**, showing each unit, its crew, and the pay
codes and notes attached to each person. Probably a print-options step on the
button — pick which units — rather than dumping the whole day view.

Build it as a dedicated print view rather than more print CSS: the on-screen
layout is a staffing tool and the printed sheet is a shift document, and they want
different things on the page.

## 4. Bug reporting

**New, and it spans both apps** — schedule and checklist. Somewhere a crew member
can report a problem without knowing who to email. Should capture what page they
were on and who they are automatically, because the useful half of a bug report is
the half people leave out.

## 5. Already specified — see the SPEC

Ordered as in the spec's build order. Nothing here is urgent per Oren 2026-09-06:

- **Phase 1 — callback list.** `hire_date` + `Assignment.hours`, configurable
  ranking tiers, call-attempt log. BLOCKED on three answers from the Asst. Chief:
  equalise OT or seniority; what "the cycle" means (FLSA 7(k) period or fiscal
  year); whether declines count against position.
- **Phase 3 — OT cause and the QA/QI report.** Now cheaper: use the pay codes above
  as the cause vocabulary. Still needs the immutable `StaffingSnapshot`.
- **Phase 4 — mandatory escalation.** Specified, never built, and the Asst. Chief
  has been told it exists. Server-side management command on a Railway cron.
- **Phase 5 — Paycom export.** Hold until the Paycom support call answers the
  double-count question. The pay-code work above is the natural precursor.

## 6. Known defect

- **`Rescue` seat order is inconsistent.** `UNIT_POSITION_REQUIREMENTS.Rescue`
  lists Driver before Officer while Engine and Ladder both read Officer first. The
  code comment directly above says seat-order inconsistency between trucks is a
  usability bug, not cosmetics. HR115 is the first Rescue on the board.

## 7. Bigger question — replace the SharePoint boards

Oren's brainstorm, 2026-09-06. Rather than wiring maintenance reporting through a
SharePoint list tied to MS Forms, build it: custom fleet/admin dashboards, custom
forms, and the **fleet work order** system that is needed anyway — with the
checklist and scheduler apps feeding it. The checklist app's
"email on critical fails" was deferred INTO this project so the notification wiring
is done once.

Worth scoping properly before committing. The honest case for it is that
`_queue_defect_report` already produces a structured defect record per run and
SharePoint can only receive it as text; the honest case against is that this is a
third application to keep running, and the department already pays for the first
two. Decide with the fleet chiefs, not from the code.
