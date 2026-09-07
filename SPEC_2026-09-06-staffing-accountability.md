# Staffing accountability — callback list, leave visibility, OT cause reporting

**Spec, 2026-09-06.** Written against the Asst. Chief's three questions. Covers the
`web-scheduler` SPA (`app.js`) and the `scheduler/` Django app in the
`fdchecklist` repo. Companion to `HANDOFF_2026-07-26.md`.

---

## 0. Read this before the next conversation with the Chief

Three things in the email reply are ahead of, or out of step with, the code.

1. **Mandatory auto-escalation is not built.** The "sent out twice + 48 hours to
   go → auto-notify the likely forced members" behaviour is specified in
   `fdchecklist/PROJECT_STATE.md` and in `AI_STATE_MIN.txt`, but nothing
   implements it. What exists is the *manual* force-in path:
   `forceCandidatesForGap()` / `forceInToGap()` in `app.js`, and the Force button
   only appears after a gap has been notified and has zero applicants. The
   escalation is the one genuinely time-triggered behaviour in the system and it
   cannot live in the SPA — the browser only runs when a tab is open, so a
   time-based rule there fires late, never, or many times. It needs a Django
   management command on a Railway cron service, like `send_daily_digest`.
   Tell him it's next, not done.

2. **The `forced` flag does not survive a round trip.** `app.js` awards a forced
   hire as `forced: true` on the overtime post, but `OvertimePostSerializer`
   (`scheduler/serializers.py`, `fields = [...]`) doesn't include it and
   `OvertimePost` has no such column. On the next state load, a forced hire is
   indistinguishable from a volunteer. **Every accountability number he wants in
   question 3 depends on that distinction.** This is a one-field migration and a
   one-line serializer change — do it first, before any of the rest.

3. **There is no hours or time-clock model.** `Assignment` is described in the
   code as "the payroll backbone" and it does carry `paid_employee` (so a trade's
   pay and its labour are already separable), but it has no hours, no rate, no
   cause, and `Employee` has no hire date. Nothing in either repo tracks time
   served or hours worked. That's not a problem — most of what he asked for is
   *derivable* from `Assignment` — but "already started building" overstates it.

---

## 1. Question 1 — "who is worth calling, in order"

### What he is actually asking for

Two different lists that his question treats as one. Keeping them separate is the
whole design:

| | **Voluntary callback** | **Mandatory (forced)** |
|---|---|---|
| Who's on it | every qualified, off-duty, available member | only members who pre-picked that date |
| Ordering | fairness policy (see below) | the pre-picked `order`, first-called first |
| Platoon filter | none — anyone off duty | only the platoon `mandatoryEligibleShift(date)` allows (72-hour rule) |
| Already built? | eligibility yes, ordering no | yes, `forceCandidatesForGap()` |
| When it's used | first | only after the voluntary list is exhausted |

One screen, two stacked sections. The ICT works the top list down the phone; when
it's dry, the bottom list unlocks. Today the Force button already refuses to
appear until a gap has been notified with no applicants — same rule, made visible.

### What we already have, with no new data

Derived from `Assignment` and `Employee` as they stand:

- **Qualifications** — `certs` + `ride_up`, and `seatAccepts(pos, emp)` already
  answers "can this person hold this seat" per-seat rather than per-person.
- **When they last worked** — max `Assignment.date` where `date < today`. One query.
- **OT worked already** — count of `Assignment` rows with
  `assignment_type = "overtime"` in the period. Approximate (see hours, below)
  but immediately useful.
- **Already working that date** — `assignedEmployeeIdsForDate(date)`; the
  same-day double-booking bar is already department-wide at both apply and award.
- **Rank** — `Employee.title`.

### What is missing

Two things, both small:

- `Employee.hire_date` (DateField, null=True) — "time served". One column, one
  import. Add it to the existing roster import (`applyRosterImport` /
  `previewRosterImport` already read an optional ride-up column, so the pattern
  exists). Sourced from Paycom or the staff contact sheet.
- `Assignment.hours` (DecimalField, default 24) — one Assignment row is one
  24-hour shift day on the 48/96. A partial callback (a 4-hour hold-over, a
  12-hour fill) cannot be represented today, so an OT *hours* total built purely
  from row counts will be wrong the first time somebody works a partial. Default
  it to 24 and nothing changes until someone edits it.

### Ranking: configuration, not code

He asked for "a consensus of how you would want that system to be tiered." Don't
wait for it. Build the tiers as an ordered, stored list and the consensus meeting
becomes a five-minute drag-and-drop instead of a change request.

```
CallbackPolicy
  name          e.g. "Voluntary OT"
  tiers         JSON, ordered: ["ot_hours_asc", "last_worked_asc",
                                "seniority_desc", "rank_desc", "name_asc"]
  period        "fiscal_year" | "flsa_cycle" | "rolling_90"
  active        bool  (one active policy at a time; changes are audited)
```

Available comparators — each is a pure function of data we already have or are
adding, so new ones are cheap:

| key | meaning |
|---|---|
| `ot_hours_asc` | least overtime worked in the period first (equalisation) |
| `last_worked_asc` | longest since last worked first (rest / spread) |
| `seniority_desc` | earliest `hire_date` first |
| `seniority_asc` | most junior first (some departments force from the bottom) |
| `rank_desc` / `rank_asc` | by `title` order |
| `refusals_asc` | fewest recorded declines first |

The list is always **filtered first** by `seatAccepts()` for the seat that is
actually open and by availability, then sorted by the tier chain. Filtering by
the real seat is what stops the ICT calling six people who can't legally take it.

### The call log — the part that protects the department

Ranking alone doesn't answer the grievance. Log every attempt:

```
CallAttempt
  overtime_post FK
  employee      FK
  attempted_at  datetime
  attempted_by  (the ICT / BC)
  outcome       "no_answer" | "declined" | "accepted" | "left_message" | "unavailable"
  note          short free text
```

That gives you, for any shift, a printable "we called these people in this order
at these times and this is what they said." It also feeds `refusals_asc` and, in
question 3, the "how hard was this hole to fill" measure. Recording an outcome
should be one tap next to the name; the row then greys and the next name lights.

### Surface

Extend the existing Coverage tab rather than adding a new place to look:
`coverageGaps()` → open a gap → the ranked call list with the columns he named
(name, rank, quals as `pill-cap` chips, OT hours this period, last worked,
phone). Print/export the list so the ICT can work off paper when the tablet dies —
this is a phone-in-hand task at 0500 and it must degrade gracefully.

### Decisions he owes us

1. **Equalise or seniority?** Lowest-OT-first and most-senior-first are different
   philosophies and the union answer may already exist in the contract.
2. **What is "the cycle"?** "Hours worked in cycle" most likely means the FLSA
   §7(k) work period — commonly 27 days / 204 hours for fire — but that is an
   *inference on my part, not something I verified.* We need the department's
   period length and start date, or the answer is "fiscal year."
3. Do declines and no-answers count toward a member's position in the order, or
   only accepted hours?

---

## 2. Question 2 — RTO/PTO and Paycom

### Position

**Paycom stays the system of record for money and accruals. The scheduler needs
visibility, not authority.** Anything else creates two truths about a person's
leave balance, and the one on the wall board is the one that will be wrong.

But the scheduler cannot staff around leave it cannot see, and today it sees
none. A vacation day is invisible until a template push writes the member into a
seat they can't work. So: mirror leave into the scheduler, one-directional,
clearly labelled.

```
Absence
  employee     FK
  start_at     datetime      # datetimes, not dates — see below
  end_at       datetime
  kind         vacation | sick | injury_on_duty | comp | bereavement |
               military | fmla | training_detail | admin_leave | other
  status       requested | confirmed | denied | cancelled
  paycom_ref   char, blank   # confirmation number, if we mirror from Paycom
  entered_by   char
  note         char
```

Two details that matter:

- **Datetimes, not dates.** Partial-day leave is common and the shift day rolls
  at 0800, not midnight. `todayIso()` already handles the 0800 boundary; the
  absence model has to agree with it or an 8-hour vacation on the front half of a
  48 will land on the wrong shift day.
- **An absence creates a gap.** If the member holds a `StaffingTemplate` seat on
  a date they're absent, the seat becomes an open gap in `coverageGaps()`
  automatically. That single link is what turns leave entry from paperwork into
  the thing that drives coverage — and it is what makes question 3 nearly free.

Flow: member records intent in the scheduler (optionally with their Paycom
confirmation number) → supervisor marks it confirmed → the board shows it and the
seat opens. Every screen that shows an absence says *Paycom is the record for
pay and accruals.* We never compute a balance.

### The Paycom export — research, not a build, yet

His instinct is right that a call with Paycom support will save weeks. Go in with
these questions, in this order:

1. Does our contract include **Time & Attendance** with an import path, and is it
   an API or a batch file? What exactly is the timecard import spec?
2. Is the import **punch-based** (in/out timestamps) or **hours-based** (earning
   code + hours per day)? Hours-based maps cleanly onto `Assignment`; punch-based
   does not, because we schedule tours, not punches.
3. **The double-count question, which is the one that decides everything:** when
   RTO is approved in Paycom, does it auto-populate the timecard? If yes, and we
   also import worked hours for that day, do the two stack? What is the
   documented way to avoid it — do we suppress our row, or does their import
   overwrite?
4. What **earning codes** exist, and can we map: regular, voluntary OT, mandatory
   OT, trade-worked-unpaid, deployment?
5. Can a row carry a **cost centre / labour allocation code** for reimbursable
   deployments (state/FEMA)? If it can, deployment reimbursement paperwork stops
   being a spreadsheet.
6. Is there a **sandbox** to test an import against before it touches a live
   payroll run?

The trade case is the landmine and we're already built for it: on an approved
trade the accepter works and the poster is paid, `Assignment.paid_employee`
records exactly that, and `paid_to` resolves it. Payroll reads `paid_to`;
staffing reads `employee`. Whatever export we build must not collapse the two.

**Recommendation: do not build the export until question 3 is done.** The cause
data makes the export more valuable and the report is useful on its own; an
export that's wrong on day one costs more trust than it saves time.

---

## 3. Question 3 — OT cause, and the QA/QI report

This is the most valuable of the three and, once leave is in the system, the
cheapest.

### The architectural point

The current violations view is computed **live** from present state. That's
correct for today's board and useless for a fiscal year: edit a past assignment
and history silently changes underneath you. A budget conversation needs numbers
that don't move.

So write an immutable **daily snapshot**, from a Django management command on a
Railway cron service (same pattern as `send_daily_digest`), after the shift day
closes:

```
StaffingSnapshot          # one row per unit per date
  date, unit
  required_seats, filled_seats, gap_count
  ot_assignments, forced_assignments, ot_hours
  causes                 JSON, e.g. {"sick_call": 1, "deployment": 2}
  min_staffing_met       bool
  captured_at
```

Reports read snapshots. The board reads live state. They never share a code path.

### The cause taxonomy

Every gap gets a cause. Put it on `OvertimePost` (which already represents an
announced gap) plus the source it came from:

```
cause              sick_call | injury_on_duty | leave_approved | vacancy |
                   deployment | training_detail | admin_leave |
                   staffing_increase | apparatus_activated | trade_shortfall | other
cause_absence      FK Absence, null   # where the cause came from, if known
cause_employee     FK Employee, null  # whose absence opened the hole
cause_note         char, blank
forced             bool               # see §0.2 — fix this first
```

### Auto-derivation is what makes this work

Never ask a BC at 0430 to pick from a dropdown. Derive:

- Member has a confirmed `Absence` on that date and held the template seat →
  cause = that absence's kind, `cause_absence` set. **Free.**
- Seat has no template assignment and the unit is front-line → `vacancy`.
- Unit was activated for the date via `activateUnitForDate()` →
  `apparatus_activated`. **Free, already audited.**
- Admin raised minimum staffing for the date → `staffing_increase`.
- Nothing matches → prompt once, at the point the gap is *created*, with the
  short list. A last-minute call-off is the main manual case, and the BC is
  already in the app opening the gap.

The prompt is the fallback, not the mechanism. If most gaps require typing, the
data will be garbage within a month.

### The report

`/dashboard/` in the Django app already exists and is staff-only — put it there,
not in the SPA, because it's a management view over history and it should not
need the SPA's bearer token dance.

- Filters: date range, platoon, station, unit, cause.
- "B shift, March: 14 OT slots — 6 sick call, 4 deployment, 3 vacancy, 1 training."
- Hours by cause, forced vs voluntary split, average time-to-fill (from
  `notified_at` → award, and the `CallAttempt` log).
- Repeat offenders in the *structural* sense: which seat on which unit generates
  the most OT. That's the vacancy argument, in numbers.
- CSV export, same pattern as `assignments/export.csv` and the audit export.

### Cost, without putting salaries in the app

He wants budget prediction, which means dollars. Do **not** store individual
salaries — that's HR data in an app crews sign into. Store a small
`RankRate` table (title → average loaded hourly rate, effective-dated,
maintained by admin) and report estimated cost. It's accurate enough for
budgeting, it's defensible, and it keeps individual pay out of the system
entirely. Say plainly on the report that figures are estimates from rank
averages.

### Frame it the way he framed it

He was careful to say this isn't targeting. Build that in: the report defaults to
cause and unit, **not** to individuals. Person-level OT totals belong on the
callback list, where they're about fairness in who gets called. Same data, and
the default view decides how the tool reads to the people it's about.

---

## 4. Build order

| Phase | What | Why here | Rough size |
|---|---|---|---|
| **0** | `OvertimePost.forced` field + serializer; migration `0011` | Everything downstream needs it; it's an hour | XS |
| **1** | `Employee.hire_date` + roster import column; `Assignment.hours`; callback list ordering + `CallbackPolicy` + `CallAttempt` | Answers his most concrete ask, mostly from data we already have | M |
| **2** | `Absence` model, board display, gap-from-absence link | Keystone — unlocks phase 3's cause data for free | M |
| **3** | Cause on gaps + auto-derivation; `StaffingSnapshot` cron; `/dashboard/` QA/QI report; `RankRate` | The accountability answer | L |
| **4** | Mandatory escalation command (the thing the email says exists) | Server-side cron, needs the notification stack that now exists | S–M |
| **5** | Paycom export | Only after the Paycom call answers the double-count question | ? |

Phase 4 could jump ahead of 3 — the email already promised it.

---

## 5. Files that change

**`fdchecklist/scheduler/`**
- `models.py` — `Absence`, `CallAttempt`, `CallbackPolicy`, `StaffingSnapshot`,
  `RankRate`; fields on `Employee` (`hire_date`), `Assignment` (`hours`),
  `OvertimePost` (`forced`, `cause`, `cause_absence`, `cause_employee`, `cause_note`)
- `migrations/0011_…` onward — one migration per phase, never a combined one
- `serializers.py` — add `forced` (phase 0); absence + cause round-tripping
- `views.py` — `_write_state` upsert/prune for absences; report endpoints.
  **Do not put absences or snapshots through `/state/`** — the payload cap
  (`HISTORY_KEEP = 250`) exists because unbounded collections killed saves
  silently. Absences are bounded per date range; snapshots are read-only history
  and belong on their own endpoints.
- `management/commands/` — `capture_staffing_snapshot`, `escalate_unfilled_overtime`
- `admin.py`, `checklists/templates/` for the dashboard report

**`web-scheduler/`**
- `app.js` — callback list render + ordering, absence entry and display, cause
  prompt on gap creation, `CallAttempt` recording
- `index.html`, `styles.css` — the call list, absence chips on the board
- `AI_STATE_MIN.txt` — must be updated in the same session; it's the preload
- `fdchecklist/PROJECT_STATE.md` — Next up list

---

## 6. Risks and edge cases

- **Timezone/boundary.** Absences use datetimes; every comparison must go through
  the same America/Chicago, 0800-rollover logic as `todayIso()`. A UTC comparison
  will put front-half-of-a-48 leave on the wrong day. This bit us once already.
- **Backups.** Still no automated Railway Postgres backups — deferred to go-live
  week by decision. Every migration in this spec is additive (new tables, nullable
  columns), which is the safe class, but take a `pg_dump` before each one anyway.
- **Snapshot idempotency.** The capture command must be safe to re-run for a date
  (update-or-create on unit+date), or a cron retry doubles the fiscal year.
- **Trade + absence interaction.** A trade already separates worked from paid. An
  absence on a traded date has to resolve against `employee`, not `paid_to`, or
  the wrong person shows as off.
- **Callback fairness is contestable by design.** Whatever tiering ships will be
  audited by the people it ranks. `CallbackPolicy` changes must be audit-logged
  with who and when, and the list should be able to show "why this order."
- **Cause quality decays.** If manual entry is more than ~20% of gaps, the report
  is fiction. Measure the manual share and put it on the report itself.
- **Payload size.** See above — this is a correctness issue in this codebase, not
  an optimisation.

---

## 7. Tests

- `mandatoryEligibleShift()` against the 48/96 pattern across a year — including
  the FY boundary and a DST transition.
- Ranking: golden-file test per policy — same roster, three tier orders, three
  expected orderings. Fairness logic that isn't pinned will drift.
- `seatAccepts()` filtering on the callback list: an engineer without ride-up
  must not appear for an officer seat; a ride-up grant must survive a roster
  re-import (this regressed once — licences now merge forward).
- Absence → gap: confirmed absence on a template seat opens exactly one gap; a
  cancelled absence closes it; a partial-day absence on the front half of a 48
  lands on the correct shift day.
- Snapshot: idempotent re-run; editing a past assignment does **not** change an
  existing snapshot.
- Paid vs worked: an OT assignment on a traded date reports one worked person and
  one paid person, and the QA/QI report counts the OT once.

---

## 8. Decisions to bring to the meeting

| # | Decision | Blocks |
|---|---|---|
| 1 | Callback order: equalise OT, or seniority? Contract language? | Phase 1 |
| 2 | What is "the cycle" — FLSA §7(k) work period (length + start date) or fiscal year? *Unverified inference on my part.* | Phase 1 |
| 3 | Do declines/no-answers affect a member's position? | Phase 1 |
| 4 | Leave: mirror-from-Paycom only, or in-app request first with a Paycom reference? | Phase 2 |
| 5 | Cause list — is the taxonomy in §3 the department's language? | Phase 3 |
| 6 | Cost reporting: rank-average rates (recommended) or none at all? | Phase 3 |
| 7 | Escalation: does it only warn the pool, or actually assign? Warning first is safer. | Phase 4 |
| 8 | Paycom: who sets up the support call, and do we have Time & Attendance? | Phase 5 |
