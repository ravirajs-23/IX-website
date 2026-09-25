# IncubXperts Website

A static HTML/CSS/JS corporate site. Two small build scripts keep it DRY:
one generates case-study pages from Strapi, the other keeps the shared
header/footer in sync across every page.

```
incubxperts-website/
├── index.html, about.html, services.html, team.html,
│   blog.html, careers.html, contact.html   # hand-written pages — unique
│                                             content, but header/footer are
│                                             SYNCED (see below), not hand-edited
├── case-studies.html                        # GENERATED — case-study listing page
├── case-studies/<slug>.html                 # GENERATED — one page per APPROVED case-story
├── data/case-studies-manifest.json          # approved case-study content — see "Case studies" below
├── content/case-studies-archived/<slug>.md  # OLD local content, no longer built — see below
├── images/case-studies/, images/hero/       # images referenced by pages
├── templates/
│   ├── template.html                        # shared shell for case-study pages
│   └── partials/header.html, footer.html    # SINGLE SOURCE OF TRUTH for nav
│                                             & footer — used by every page
├── .claude/skills/review-case-studies/      # Claude Code skill: review + approve + open a PR
├── scripts/
│   ├── build-pages.js                       # syncs partials into the 7 hand-written pages
│   ├── build-case-studies.js                # renders the site FROM the manifest (no Strapi access)
│   ├── review-case-studies.js               # Strapi vs. manifest: what's new/updated, with diffs
│   ├── publish-case-studies.js              # approve slugs -> update manifest -> render -> git add
│   ├── seed-case-studies-manifest.js        # one-time: bootstrap the manifest from current Strapi
│   ├── refresh-testimonials.js              # explicit, separate step to update the sitewide carousel
│   ├── case-study-environments.js           # publish targets (today: just Production/main)
│   └── lib/case-studies-core.js,
│       lib/case-studies-strapi-source.js    # shared rendering / Strapi-fetching modules
├── css/style.css, js/script.js
├── sitemap.xml, robots.txt, llms.txt        # sitemap.xml is GENERATED; the others are hand-maintained
└── package.json
```

**Never hand-edit files under `case-studies/`, `case-studies.html`, or
`data/case-studies-manifest.json`** — they're generated/written by the
scripts above, and any page whose manifest entry is removed is deleted
automatically on the next build. Edit content in Strapi, then go through the
`review-case-studies` approval workflow (see "Case studies" below).

**Never hand-edit the `<header>`/`<footer>` blocks inside any page** — edit
`templates/partials/header.html` or `footer.html` instead, then run:
```bash
npm run build     # runs build:pages then build:case-studies
```
This is the pattern to remember: **content lives in one place, pages are
generated from it.** If you ever find yourself about to paste the same
change into more than one `.html` file, that's a sign it should become a
shared partial or a data-driven template instead — ask me and I'll set
that up rather than hand-editing N files.

---

## Case studies: Strapi content, approved through a manifest (as of 2026-09-25)

`case-studies/*.html`, `case-studies.html`, `sitemap.xml`'s case-study
entries, and `llms.txt`'s case-study block are all generated purely from
**`data/case-studies-manifest.json`** — a git-committed, human-approved
snapshot of case-story content. `scripts/build-case-studies.js` reads only
that file; it has **no Strapi/network access at all**, which is what makes
it safe to run anywhere (including Vercel, see "Deployment" below) and keeps
the mandatory pre-push rebuild-drift check meaningful.

Strapi (Content Manager → Case Stories) is still where you author/edit case
studies — it's just no longer built directly. New or changed Strapi content
only ever reaches a **Pull Request** after going through the
**review-case-studies** workflow — never a direct push to `main`, so a
developer always reviews the actual diff before anything goes live:

```bash
node scripts/review-case-studies.js     # what's new/updated in Strapi vs. the manifest
node scripts/publish-case-studies.js --slugs=<a,b,c> --env=production --approved-by="you"
# (the two commands above only stage files - commit/branch/push/PR are a separate, visible step)
git checkout -b case-studies/publish-<timestamp>
git commit -m "..."
git push origin case-studies/publish-<timestamp>   # triggers the pre-push hook
gh pr create --base main --title "..." --body "..."
```

If you use Claude Code, the **`review-case-studies`** skill
(`.claude/skills/review-case-studies/SKILL.md`) drives this whole flow
conversationally — it runs the review script, presents new/updated stories
and their diffs in plain language, asks what to approve, runs the publish
script, and only creates a branch/commit/PR after you explicitly confirm.
Just ask Claude to "review case studies" (or similar). It's designed to be
usable by a non-technical person, not just a developer — see "Rolling this
out to a non-technical teammate" below.

**One-time setup** (per repo, not per person):
1. Copy `.env.example` to `.env` (gitignored) and fill in `STRAPI_URL` /
   `STRAPI_API_TOKEN` (read access is enough) for whichever Strapi instance
   you want this to check — any URL works, there's no hardcoded assumption
   about which instance it is.
2. Install and authenticate the [GitHub CLI](https://cli.github.com/)
   (`gh auth login`) — needed to open Pull Requests.
3. Run `node scripts/seed-case-studies-manifest.js` once — this treats every
   story currently live as pre-approved, so it doesn't show up as "new."

### Rolling this out to a non-technical teammate

This skill is meant to work for someone who can edit Strapi but doesn't
write code. Their part of the setup, done once (probably with an
engineer's help):
1. Install Node.js, git, [Claude Code](https://claude.com/claude-code), and
   the [GitHub CLI](https://cli.github.com/).
2. Clone this repo and run `npm install`.
3. Copy `.env.example` to `.env`, fill in `STRAPI_URL`/`STRAPI_API_TOKEN`.
4. `gh auth login` with a GitHub account that can create branches and open
   Pull Requests on this repo (it does **not** need push access to `main`
   itself — this workflow never pushes there directly. If you want to grant
   zero write access to this repo at all, a fork-based PR flow is a more
   restrictive alternative, not set up by default here).

Day to day: open Claude Code in the project folder and ask it to "review
case studies." It walks through what's new/changed, asks what to approve,
and — if anything's approved — opens a Pull Request. **That's the end of
their part.** A developer reviews and merges the PR; merging is what
actually deploys it. If the automated push-time check fails, the skill will
say so plainly and stop — that's a signal to loop in a developer, not
something to work around.

This local-setup model is the starting point, not necessarily the end
state — a hosted version of this tool (no local clone/`.env` required) is a
reasonable next step if this gets used often enough to justify it.

**How approval works:** `data/case-studies-manifest.json` freezes each
approved story's content (including a diff-friendly "source snapshot" used
to detect future Strapi edits) plus a content hash. A Strapi entry not yet
in the manifest is invisible to the site entirely (no page, no listing
card, no sitemap entry — so there's no way to end up with a dead link to
unapproved content). An already-approved story whose Strapi content changes
since keeps rendering its last-approved version — silently, forever — until
someone runs the publish workflow again and approves the update; edit-and-
forget in Strapi does not auto-publish.

**Known limitation, not addressed by this workflow:** if a Strapi entry is
deleted or its slug renamed, `review-case-studies.js` surfaces it as
"orphaned" (still live, no matching Strapi entry) but nothing removes the
page automatically — that's a deliberate, currently out-of-scope gap; take
it down by hand if that's ever needed.

**How a Strapi `case-story` entry maps onto the site:**

| Strapi field | Maps to |
|---|---|
| `Title` | title |
| `slug` | URL slug |
| `BGImage` | heroImage (banner + listing thumbnail + social image) |
| `CaseDetailsImageVideo` | detailImage — a second image/video shown above "Business Problem" (renders as `<video>` if its mime type starts with `video/`) |
| `TagsCommaSeparated` | tags (pill row) |
| `CaseDetailsMarkdown` (if set) else `CaseDetails` (Blocks) | body — `## Heading` splits into page sections either way |
| `master_industry_types` (first one) | category/breadcrumb — falls back to "General" if empty |
| `case_benefits_and_impacts` (relation) | benefits (with optional icon from `IconImage`; falls back to a default icon if unset) |
| `SEOdescription` / `OGdescription` | metaDescription / heroSummary |
| `OGimage` (falls back to `BGImage`) | social-share image |

**The "TRUSTIMONIALS" carousel is NOT per-entry** — verified directly against
the live site (two unrelated case stories rendered byte-identical
testimonial carousels, same order): it's the exact same full list on every
case-study page. So it's built from Strapi's separate, standalone
`testimonial` collection (`/api/testimonials`) rather than any relation on
the case-story entry itself — a case-story's own `testimonials` relation
field (if you see one in the Strapi admin) is not used by this site at all.

Because it's sitewide (shared by every case-study page, not tied to any one
approved story), it's **deliberately not refreshed automatically** by
`publish-case-studies.js` — that was tried and caused a real incident during
testing: approving a couple of stories from a near-empty local Strapi
instance silently overwrote the real 19-testimonial carousel on all 100 live
pages with that instance's 3 test entries, as a side effect of an unrelated
approval. Update testimonials with its own explicit step instead:
```bash
node scripts/refresh-testimonials.js   # or: npm run case-studies:refresh-testimonials
```
Same pattern as everything else here: it stages the change (manifest +
regenerated pages) but doesn't commit/push — review `git diff --cached
--stat` before committing. It refuses to run if Strapi returns zero
testimonials, but a smaller-than-expected (not zero) count won't be caught
automatically — check the count it prints before committing.

**Known limitations of the current mapping** (fine for now, worth revisiting
if they become real gaps):
- No numeric `stats` block equivalent exists in the Strapi schema yet — that
  block just doesn't render.
- Strapi's `case-story` schema has no `client` field, and the current
  template doesn't display one anyway, so it's left blank.
- An entry missing `slug` or `Title` is skipped with a console warning
  rather than breaking the whole build — fix it in the Strapi admin.

**Production Strapi**: not wired up yet. When ready, add
`STRAPI_PROD_URL`/`STRAPI_PROD_API_TOKEN` to `.env` (placeholders already in
`.env.example`) and extend `fetchStrapiCaseStudies()` in
`scripts/lib/case-studies-strapi-source.js` to also query the prod instance.
(This is about which Strapi *content source* to query — separate from the
`environment` concept in `scripts/case-study-environments.js`, which is
about which git branch/deploy target to publish *to*.)

### History: local `.md` files (no longer built)

Before Strapi was connected, case studies were authored as local
Markdown+front-matter files under `content/case-studies/`. That hybrid model
caused `/case-studies/` to drift out of sync with Strapi (extra pages
lingering after their local source no longer matched what was in Strapi),
so it was retired in favor of Strapi as the sole source.

The 3 real case studies that only ever existed as local files — "An AI
Assistant that Provides Pinpoint Insights...", "AI-Driven Gamified Platform:
Cultivating Grit in Youth", and the AI trivia quiz story — are **not lost**,
just archived at `content/case-studies-archived/` (along with a disclosed
test/demo file). They are no longer built into the site. If you want them
live again, recreate them as real entries in Strapi (their front matter maps
cleanly onto the Strapi fields in the table above) — ask me to help migrate
the content across if that's useful.

---

## Checking styling against the live site

`scripts/style-diff.js` (`npm run style-diff`) compares computed CSS between
the live site and this one, at a fixed set of breakpoints, for a fixed list
of elements (hero heading/subtitle, buttons, cards, section headings). It
exists because hand-checking `getComputedStyle()` one snippet at a time
doesn't scale and easily misses viewport-dependent differences — a value
that matches at one width can be wrong at another if the two sites scale it
differently. This bit us directly, more than once: the live site (built with
MUI) steps typography between fixed sizes at specific breakpoints rather
than scaling smoothly, so an earlier fluid `clamp()`-based fix looked right
at the one width it was checked against and was visibly wrong at others;
separately, `color` alone has repeatedly been a red herring for a gradient-
clipped heading (the real fill lives in `backgroundImage`/
`webkitTextFillColor`, `color` just carries the plausible-looking fallback).

**Usage:**
```bash
npm run style-diff                                          # full 4-breakpoint sweep, ours = http://localhost:5050
npm run style-diff:fast                                     # 2 breakpoints (mobile + xl) — what the pre-push hook runs
OURS_BASE_URL=https://your-deploy.vercel.app npm run style-diff
```
Needs a local Chrome or Edge install (uses `puppeteer-core` against it, not
a bundled/downloaded browser — set `CHROME_PATH` if it's somewhere
non-standard). Requires the local static site running first (`npx serve`,
see `.claude/launch.json`) if not pointing `OURS_BASE_URL` at a deployment.

Add more breakpoints/elements to `BREAKPOINTS`/`SCENARIOS` in the script as
new gaps are found — it's meant to grow, not be a one-off audit. When you
fix a visual bug found by hand (in a chat session or otherwise), add a
scenario for it here too, so a future change can't silently reintroduce the
same bug — that's the whole point of the pre-push hook below.

### Mandatory pre-push check

`git push` runs `scripts/style-diff.js --fast` automatically (via a
`pre-push` git hook) and **blocks the push if anything mismatches**. This
is deliberate, not a suggestion — this project's history is full of things
that were called "verified" after a visual/screenshot pass and turned out
wrong once actually diffed against computed style, including entire
sections built with the wrong component. The hook also refuses to push if
`npm run build` produces uncommitted output (i.e. a template/script was
edited without regenerating and committing the built pages).

- **Installed automatically** by `npm install` (via `postinstall` →
  `node scripts/install-hooks.js`), since `.git/hooks/` isn't tracked by
  git and wouldn't otherwise survive a fresh clone. Re-run
  `node scripts/install-hooks.js` by hand if you ever suspect it's missing.
- **The hook script itself lives in `scripts/hooks/pre-push`** (tracked,
  editable) — `.git/hooks/pre-push` is just a copy of it.
- **Bypass** (use sparingly, and only for a push that genuinely doesn't
  touch any rendered page — e.g. a README-only change):
  ```bash
  git push --no-verify
  ```
- If a scenario itself is stale or wrong (a page was intentionally
  restructured, an element no longer exists) — fix the scenario in
  `scripts/style-diff.js` with a comment explaining why, the same as any
  other bug fix; don't reach for `--no-verify` to work around a check
  that's correctly catching something.

---

## Editing the other pages

The 7 hand-written pages (`index.html`, `about.html`, etc.) hold their own
unique content — edit their HTML directly for anything inside the page body,
then `git add -A && git commit && git push` the same way.

**The one exception is the `<header>` and `<footer>` blocks** — those are
shared across all 7 pages (plus every generated case-study page) and are
kept in sync automatically. Don't hand-edit them in any individual page;
instead:

1. Edit `templates/partials/header.html` or `templates/partials/footer.html`
   (e.g. to add a nav link, change the footer address, or update the
   copyright year)
2. Run `npm run build` (or just `npm run build:pages` if you only touched
   the header/footer)
3. All 7 pages + every case-study page update at once

Under the hood: each page's header/footer is wrapped in HTML comment
markers (`<!-- SITE-HEADER:START -->` / `:END`, same for the footer).
`scripts/build-pages.js` replaces everything between those markers with
the current partial content — safe to re-run any time, it never
duplicates or drifts. If you ever paste a raw `<header>`/`<footer>` block
back in by hand and remove the markers, the next `npm run build:pages`
will detect that and re-wrap it automatically.

---

## Deployment

- Repo: https://github.com/ravirajs-23/IX-website
- Hosting: Vercel, auto-deploying on every push to `main` (config in
  [vercel.json](vercel.json): `framework: null`, `outputDirectory: "."`)
- **Vercel's build command is `npm run build:pages`**, not the full
  `npm run build`. All generated output (case-study pages, `case-studies.html`,
  `sitemap.xml`, `llms.txt`) is committed to git and served as-is; Vercel
  only re-syncs the header/footer partials.
  Historically this was also a hard safety requirement: an older version of
  `build:case-studies` fetched Strapi directly and would silently wipe every
  case study from the live site if Strapi was unreachable during a Vercel
  build (this happened once, 2026-09-07 — see git history around commit
  `6fbdaa6`). As of 2026-09-23, `build:case-studies` no longer talks to
  Strapi at all — it only reads the committed
  `data/case-studies-manifest.json` (see "Case studies" above) — so that
  specific failure mode is gone and it would technically be safe to add it
  to Vercel's build command. Left as `build:pages`-only for now since
  nothing requires the extra step to run at deploy time (output is already
  committed); revisit only if that changes.
- To connect auto-deploy on a fresh project: go to vercel.com/new, import
  this repo, framework preset "Other" — the settings in `vercel.json` take
  over from there.

## Domain note

Canonical URLs, Open Graph tags, and `sitemap.xml`/`llms.txt` currently all
reference `https://www.incubxperts.com` as a placeholder. If the real
launch domain differs, that needs updating across the hand-written pages'
`<head>` blocks and the `SITE_URL` constant at the top of
`scripts/build-case-studies.js`.

## Known limitation: adding an 8th hand-written page

`sitemap.xml` is fully generated by `build-case-studies.js`, but the list of
the 7 hand-written pages (their URLs/priorities) is a hardcoded array
(`STATIC_PAGES`) in `scripts/lib/case-studies-core.js` — it doesn't scan the
repo for new `.html` files. If you ever add a new hand-written page (not a
case study), add it to `PAGES` in `scripts/build-pages.js` (so its
header/footer stay in sync) and to `STATIC_PAGES` in
`scripts/lib/case-studies-core.js` (so it appears in the sitemap). Ask me to
do this rather than editing both
arrays by hand if it's not obvious.
