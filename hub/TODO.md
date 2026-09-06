# Hub — open items

Every tile points somewhere and every link has been verified. What's left are
two design decisions and some housekeeping.

## Housekeeping

- **SharePoint team folders.** The Wildland and REM Rescue tiles use sharing
  links (`/:f:/s/<site>/…?e=…`). Those work, but they can be revoked and they're
  tied to one share. The site roots — `d7fr.sharepoint.com/sites/WildlandTeam`
  and `/sites/REMRescue` — are more durable if the landing folder doesn't matter.
- **Team folder permissions.** Confirm a non-member hitting either team tile gets
  a clean "request access" page rather than an error.
- **Scheduler brand gold.** The scheduler's `styles.css` uses `#ff9f43`; the real
  department gold from the scramble is `#e0ae31`. Worth aligning next time that
  file is touched, so the three apps match exactly.

## Decisions to make

### 1. Training / department calendar

We only have the M365 calendar on `events@d7fr.org`. It carries everything the
department does, so it cannot be published as-is. Options, roughly cheapest first:

- **Categorize and filter.** Tag training events in the existing calendar, then
  publish a filtered view. Simplest, but relies on discipline at entry time and
  M365's published-calendar filtering is limited.
- **A separate `training@d7fr.org` calendar.** Clean separation, publishable on
  its own, but two calendars to keep in sync and events get double-entered.
- **Graph API pull into the hub.** A small job reads the calendar, filters by
  category, and writes a JSON file the hub renders. Full control over what is
  shown; needs app registration, a secret to store, and a place to run it.

Decide before building. Whatever we pick, no attendee names or personal details
on a public page.

### 2. Self-hosting SOGs / policy

Currently through Lexipol (`app.lexipol.com`). Goal is to bring policy in-house.
Things to work through before committing:

- What Lexipol actually gives us that we would have to rebuild: version history,
  acknowledgement tracking (who read which policy, when), the Texas-specific
  content updates, and the daily training bulletins.
- Acknowledgement tracking is the hard requirement — it is the part that matters
  in a liability review, and it is more than a folder of PDFs.
- Candidate approaches: a SharePoint library with versioning plus a Power
  Automate acknowledgement flow (no new infrastructure); or a policy app on the
  existing Django backend (same Entra login as the other apps, full control,
  more to build and maintain).
- Export path matters. Confirm what format Lexipol lets us take with us before
  the contract conversation, not after.

### 3. Consolidate the in-app nav

The scheduler (`index.html`, `.hub-nav`) and the checklist app each hand-maintain
a short list of cross-app links. Once the hub is live, both should link to
`hub.d7fr.org` instead of growing their own copies.

### 4. Forms vs. the apps we run

The apparatus maintenance form overlaps the checklist app — a crew that fails a
check item is already telling us the rig has a problem. Worth deciding later
whether an OOS report should be raised from inside the checklist app instead of
a separate form.

## Content notes

- **Peer support card** deliberately has no phone number: Yvonne Garcia leads
  CISM and the number available is her personal cell. The card routes people to
  her through Teams or email instead. If the department ever stands up a peer
  support line or a shared mailbox, put it here.
- **"Hurt on duty?"** is an info card, not a link — crews don't file the workers'
  comp claim, so it tells them to report to their officer the same shift. The
  Texas Mutual employer portal sits in the Admin & IT band instead.
