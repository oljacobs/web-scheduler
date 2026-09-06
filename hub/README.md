# D7FR Department Hub

A single static page of links to every system the department uses, served at
`hub.d7fr.org`. One file, no build step, no dependencies, no auth — every
destination enforces its own login.

## Files

- `index.html` — the whole page (markup, styles, and the search/help script)
- `favicon.svg` — the department scramble on a navy ground, for the browser tab
- `apple-touch-icon.png` — 180×180, for crews who pin this to a tablet home screen
- `vercel.json` — security headers and no-cache on the HTML so link edits go live immediately

Source artwork for both icons is `D7FR SCRAMBLE.ai`.

## Brand

- **Gold `#e0ae31`** — sampled straight from the scramble artwork, not eyeballed.
  This is the department gold; the scheduler's older `#ff9f43` is a near match in
  luminance, so the two apps can be brought into line whenever the scheduler's
  `styles.css` gets touched.
- Navy ground `#0a1627`, panels `#0d1f36`→`#12294a`, text `#edf3fb`,
  accent blue `#4da3ff`. Barlow for display, IBM Plex Sans for body, IBM Plex
  Mono for the host lines.
- The scramble is inlined as SVG so it stays crisp at any size and takes its
  colors from CSS. Its print keyline is black; on navy that goes muddy, so
  `.sc-line` drops it to `#050d1a` instead.

## Editing the link list

Tiles are plain HTML — copy an existing `<a class="tile">` block and change the
four things inside it:

```html
<a class="tile" href="https://example.com" target="_blank" rel="noopener"
   data-tags="extra search words nobody sees">
  <div class="tile-top"><span class="tile-name">Name</span><span class="tile-arrow">↗</span></div>
  <p class="tile-desc">One line on what it's for.</p>
  <div class="tile-foot"><span class="host">example.com</span></div>
</a>
```

Conventions:

- `target="_blank" rel="noopener"` and the `↗` arrow for anything off `d7fr.org`;
  `→` and no target for our own apps, so crews don't collect tabs.
- `class="tile is-core"` is reserved for the two apps we run (Scheduler, Checklists).
- `class="tile is-info"` on a `<div>` (not an `<a>`) is a card that answers
  instead of navigating — used for "Hurt on duty?" and peer support. No arrow,
  no hover lift, and it isn't counted as a link.
- `class="tile is-todo"` plus `data-todo` marks a placeholder: it renders dashed,
  and the script blocks the click so a tap never looks like it worked. Pair it
  with `<span class="chip">URL needed</span>`, or `chip chip-check` /
  "Verify link" for a link that needs confirming.
- `data-tags` feeds the search box only — put the words people would actually type
  ("paystub", "burn ban") there, not on the visible card.
- **The `who` label is only for tiles that are NOT for everyone** —
  `Crews & officers`, `Team members`, `Officers & admin`, `IT`. An "All crews"
  label on 22 of 32 tiles was pure noise; leaving it off makes the restricted
  ones actually register.

The "N live links" counter and the search index build themselves from the DOM.
Nothing to update when you add a tile.

## Deploy (Vercel)

The hub lives in the `web-scheduler` repo but deploys as its **own** Vercel
project, so pushing a scheduler change never redeploys the hub and vice versa.

1. Vercel → Add New → Project → import the `web-scheduler` repo (again — a second
   project on the same repo is supported).
2. Name it `d7fr-hub`. Framework preset: **Other**.
3. **Root Directory: `hub`.** This is the setting that matters — it makes
   `hub/index.html` the site root.
4. Build command and output directory: leave blank.
5. Settings → Git → **Ignored Build Step**, set to:

   ```
   git diff --quiet HEAD^ HEAD -- ./
   ```

   Root Directory controls *what* gets deployed, not *whether* a build runs —
   without this, every scheduler push also redeploys the hub. This command tells
   Vercel to skip the build when nothing under `hub/` changed. Set the mirror of
   it on the scheduler project too, if you want the same in reverse.
6. Deploy, confirm the `*.vercel.app` URL renders.
7. Project → Settings → Domains → add `hub.d7fr.org`.
8. GoDaddy DNS for `d7fr.org`: add the CNAME Vercel shows (host `hub`,
   value `cname.vercel-dns.com`). Propagation is usually minutes.
9. Re-check the page over HTTPS once the certificate issues.

Rollback is a Vercel "Promote to Production" on the previous deployment — no
database, no migration, nothing stateful to unwind.

## Notes

- Google Fonts is the only external request the page makes. It degrades to the
  system font stack if that request fails.
- The page prints cleanly (dark chrome dropped, tiles bordered) for a station
  bulletin board.
- See `TODO.md` for what is still open.
