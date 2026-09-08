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
├── case-studies/<slug>.html                 # GENERATED — one page per Strapi case-story entry
├── content/case-studies-archived/<slug>.md  # OLD local content, no longer built — see below
├── images/case-studies/, images/hero/       # images referenced by pages
├── templates/
│   ├── template.html                        # shared shell for case-study pages
│   └── partials/header.html, footer.html    # SINGLE SOURCE OF TRUTH for nav
│                                             & footer — used by every page
├── scripts/
│   ├── build-pages.js                       # syncs partials into the 7 hand-written pages
│   └── build-case-studies.js                # generates case-study pages from Strapi
├── css/style.css, js/script.js
├── sitemap.xml, robots.txt, llms.txt        # sitemap.xml is GENERATED; the others are hand-maintained
└── package.json
```

**Never hand-edit files under `case-studies/` or `case-studies.html`** — they're
regenerated from Strapi every time the build script runs, and any page whose
Strapi entry no longer exists is deleted automatically. Edit the content in
Strapi instead (see "Case studies: sourced from Strapi" below).

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

## Case studies: sourced from Strapi (the only source)

As of 2026-09-07, **Strapi is the sole source of truth** for `/case-studies/`.
Every run of `npm run build:case-studies` fetches the current case-story
entries from Strapi and makes `case-studies/` match them exactly — it also
**deletes** any previously generated page whose entry is no longer in Strapi,
so the folder can never drift out of sync or accumulate stale pages.

This means: to add, edit, or remove a case study, do it in the Strapi admin
(Content Manager → Case Stories), then re-run the build. There is no local
`.md` content workflow anymore — see "History: local `.md` files" below for
what happened to the old one.

**Setup:**
1. Copy `.env.example` to `.env` (gitignored — never commit real tokens)
2. Fill in `STRAPI_URL` and `STRAPI_API_TOKEN` (a Strapi API Token — read
   access is enough; this integration never writes back to Strapi)
3. Run `npm run build:case-studies`

If those env vars are unset or Strapi is unreachable, the build proceeds
with **zero** case studies rather than failing — existing generated pages
are cleaned up (not left stale), `case-studies.html` renders its "check back
soon" empty state, and `sitemap.xml`/`llms.txt` simply have no case-study
entries. A real HTTP-level error from Strapi (bad token, wrong path) still
fails the build loudly, since that's a config problem worth surfacing.

> ⚠️ **Because of that "zero rather than fail" behavior, `build:case-studies`
> must only ever be run where Strapi is actually reachable** — today that's
> your machine, against `http://localhost:1337`. **Never let Vercel run
> it** (see "Deployment" below for why) — it would silently wipe every case
> study from the live site, since Vercel's build servers can't reach your
> local Strapi. The workflow is: run `npm run build:case-studies` locally,
> check the output looks right, then commit + push the regenerated files.
> There is currently no build step anywhere that regenerates this content
> automatically — it's a manual, deliberate step every time Strapi content
> changes.

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
`testimonial` collection (`/api/testimonials`, fetched once per build by
`fetchAllTestimonials()`) rather than any relation on the case-story entry
itself — a case-story's own `testimonials` relation field (if you see one
in the Strapi admin) is not used by this site at all.

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
`scripts/build-case-studies.js` to also query the prod instance.

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
differently. This bit us directly once: the live site (built with MUI) steps
typography between fixed sizes at specific breakpoints rather than scaling
smoothly, so an earlier fluid `clamp()`-based fix looked right at the one
width it was checked against and was visibly wrong at others.

**Usage:**
```bash
npm run style-diff                                          # ours = http://localhost:5050
OURS_BASE_URL=https://your-deploy.vercel.app npm run style-diff
```
Needs a local Chrome or Edge install (uses `puppeteer-core` against it, not
a bundled/downloaded browser — set `CHROME_PATH` if it's somewhere
non-standard). Requires the local static site running first (`npx serve`,
see `.claude/launch.json`) if not pointing `OURS_BASE_URL` at a deployment.

Add more breakpoints/elements to `BREAKPOINTS`/`SCENARIOS` in the script as
new gaps are found — it's meant to grow, not be a one-off audit.

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
- **Vercel's build command is `npm run build:pages` — deliberately NOT
  `npm run build:case-studies`.** All generated output (case-study pages,
  `case-studies.html`, `sitemap.xml`, `llms.txt`) is committed to git and
  served as-is; Vercel only re-syncs the header/footer partials, which is
  safe because that step has no external dependency. It must never run
  `build:case-studies` on Vercel, because Vercel's build servers can't reach
  your local Strapi instance — that script would then treat Strapi as
  reachable-but-empty and silently delete every case study from the live
  site (this happened once, 2026-09-07 — see git history around commit
  `6fbdaa6`). If Strapi is ever hosted somewhere Vercel *can* reach, revisit
  this and re-enable it, adding `STRAPI_URL`/`STRAPI_API_TOKEN` as Vercel
  project env vars first.
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
(`STATIC_PAGES`) at the top of that script — it doesn't scan the repo for
new `.html` files. If you ever add a new hand-written page (not a case
study), add it to `PAGES` in `scripts/build-pages.js` (so its header/footer
stay in sync) and to `STATIC_PAGES` in `scripts/build-case-studies.js` (so
it appears in the sitemap). Ask me to do this rather than editing both
arrays by hand if it's not obvious.
