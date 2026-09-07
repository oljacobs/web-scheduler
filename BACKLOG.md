# Scheduler backlog

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

---

## 1. Time off and partial-day staffing

**This is the SPEC's Phase 2 `Absence` model, extended.** Do not build it twice.
The spec already calls for datetimes rather than dates (specifically so partial-day
leave works against the 0800 shift-day boundary) and for an absence to open a
coverage gap automatically. Oren's requirements add the seat behaviour:

- A person works part of a tour and takes the rest as PTO — 12 on, 12 off. Needs a
  **partial-day assignment**, not a whole-tour one.
- Recording that must **prompt to create a 12-hour seat** for the uncovered half,
  so the gap is explicit rather than implied.
- Marking someone off for a **full 24** prompts the same question: add a seat to
  backfill, or not. Not every absence needs backfilling — an engine carrying five
  when it needs two does not.
- So the prompt is a decision, never automatic: **"open a seat for this?" yes/no.**

Implications the spec does not yet cover:
- `Assignment` currently means "this person, this unit, this whole shift day". A
  half-tour needs start/end times on the assignment, which touches staffing counts,
  the seat filler, and anything that counts a day as one unit of work.
- A 12-hour seat is a real seat for staffing purposes but not a whole one. Decide
  whether minimum-staffing alerts treat a covered half-day as covered.

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
