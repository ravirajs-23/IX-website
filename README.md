# IncubXperts Website

A static HTML/CSS/JS corporate site. Two small build scripts keep it DRY:
one generates case-study pages from content files, the other keeps the
shared header/footer in sync across every page.

```
incubxperts-website/
├── index.html, about.html, services.html, team.html,
│   blog.html, careers.html, contact.html   # hand-written pages — unique
│                                             content, but header/footer are
│                                             SYNCED (see below), not hand-edited
├── case-studies.html                        # GENERATED — case-study listing page
├── case-studies/<slug>.html                 # GENERATED — one page per case story
├── content/case-studies/<slug>.md           # you write these
├── images/case-studies/, images/hero/       # images referenced by pages
├── templates/
│   ├── template.html                        # shared shell for case-study pages
│   └── partials/header.html, footer.html    # SINGLE SOURCE OF TRUTH for nav
│                                             & footer — used by every page
├── scripts/
│   ├── build-pages.js                       # syncs partials into the 7 hand-written pages
│   └── build-case-studies.js                # generates case-study pages
├── css/style.css, js/script.js
├── sitemap.xml, robots.txt, llms.txt        # sitemap.xml is GENERATED; the others are hand-maintained
└── package.json
```

**Never hand-edit files under `case-studies/` or `case-studies.html`** — they're
overwritten every time the build script runs. Edit the `.md` source file
instead.

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

## Adding a new case story (as admin)

### 1. Create a content file

Add a new file at `content/case-studies/<your-slug>.md`. Copy an existing one
as a starting point (e.g. `content/case-studies/ai-credit-risk-assessment-platform.md`)
or use this reference:

```
---
slug: my-new-case-study
title: A Short, Punchy Title for the Story
category: Fintech
client: A brief, anonymized client descriptor
publishDate: 2026-08-26
heroSummary: One sentence shown in the page hero and on listing cards.
metaDescription: A ~150-character SEO summary. Optional — falls back to heroSummary if omitted.
tags: Fintech, AI, Automation
heroImage: /images/case-studies/my-new-case-study.svg
benefit1Title: 60% Faster Processing
benefit1Description: A full sentence explaining this benefit's impact.
benefit2Title: Another Benefit
benefit2Description: Another full sentence.
stat1Value: 3,000+
stat1Label: Short metric label
testimonialQuote: A real, approved client quote.
testimonialAuthor: Jane Doe
testimonialRole: VP Engineering, Client Company
---
## Business Problem

Plain prose describing the problem.

## Technology Solution

Intro sentence, then a bullet list:

- **Feature Name**: what it does.
- **Another Feature**: what it does.

## Technology Stack

- Technology One
- Technology Two
```

**Field reference:**

| Field | Required? | Notes |
|---|---|---|
| `slug` | yes | must be unique; becomes the filename/URL |
| `title` | yes | |
| `category` | yes | shown as the page breadcrumb + listing-card label |
| `client` | yes | short, anonymized descriptor |
| `publishDate` | yes | `YYYY-MM-DD` — controls sort order |
| `heroSummary` | yes | one-liner |
| `metaDescription` | no | falls back to a truncated `heroSummary` |
| `tags` | no | comma-separated, shown as a pill row |
| `heroImage` | no | root-relative path to an image in `images/case-studies/`; also becomes the listing thumbnail and social-share image automatically |
| `benefit1Title`/`benefit1Description` … up to `benefit6` | no | headline + sentence impact cards; stop at the first missing number |
| `stat1Value`/`stat1Label` … up to `stat4` | no | short number + label (e.g. "3,000+" / "Users"); can be used alongside benefits |
| `testimonialQuote`/`testimonialAuthor`/`testimonialRole` | no | all three or none — partial sets error the build |
| `ogImage` | no | only needed if you want a *different* image for social sharing than `heroImage` |

**Body content** goes below the second `---`. Use `## Heading` for each
narrative section (Business Problem, Technology Solution, Technology Stack,
etc.) — each becomes its own block on the page. If you skip headings
entirely, the whole body renders as one flowing narrative instead.

**Important — this is not full YAML:**
- Don't wrap values in quotes (`title: "like this"`) — quotes aren't
  stripped and will show up literally on the page.
- A colon inside a value (e.g. `title: Scaling Ops: A New Approach`) is
  fine — only the *first* colon on the line is treated as the delimiter.

### 2. Add an image (optional)

Drop an SVG or image file into `images/case-studies/` and reference it via
`heroImage: /images/case-studies/your-file.svg` in the front matter.

### 3. Build

```bash
npm run build:case-studies
```

This regenerates `case-studies/<slug>.html`, `case-studies.html`,
`sitemap.xml`, and the Case Stories section of `llms.txt`. Read the console
output — it errors on things like a missing required field, a duplicate
slug, a bad date format, or a partial testimonial.

### 4. Preview locally

```bash
npx serve .
```

Then open the printed URL and check your new page at
`/case-studies/<your-slug>.html` and the listing at `/case-studies.html`.

### 5. Publish

```bash
git add -A
git commit -m "Add case study: <title>"
git push
```

Once pushed, if Vercel is connected to this GitHub repo it deploys
automatically. If it isn't connected yet, see "Deployment" below.

---

## Content source #2: Strapi (optional)

Case studies can also come from a Strapi CMS instance instead of a local
`.md` file — both sources are read and merged automatically every build.
This is read-only from the site's side: nothing here ever writes back to
Strapi.

**Setup:**
1. Copy `.env.example` to `.env` (gitignored — never commit real tokens)
2. Fill in `STRAPI_URL` and `STRAPI_API_TOKEN` (a Strapi API Token — read
   access is enough)
3. Run `npm run build:case-studies` as normal

If those env vars aren't set, the Strapi source is silently skipped — the
build still works purely off local `.md` files. This is what happens on
Vercel today, since those env vars aren't configured there.

**How a Strapi `case-story` entry maps onto the site:**

| Strapi field | Maps to |
|---|---|
| `Title` | title |
| `slug` | URL slug |
| `BGImage` | heroImage (banner + listing thumbnail + social image) |
| `TagsCommaSeparated` | tags (pill row) |
| `CaseDetailsMarkdown` (if set) else `CaseDetails` (Blocks) | body — same `## Heading`-splits-into-sections convention as the `.md` files |
| `master_industry_types` (first one) | category/breadcrumb — falls back to "General" if empty |
| `case_benefits_and_impacts` (relation) | benefits (with optional icon from `IconImage`) |
| `testimonials` (relation, first one only — see note below) | testimonial |
| `SEOdescription` / `OGdescription` | metaDescription / heroSummary |
| `OGimage` (falls back to `BGImage`) | social-share image |

**Known limitations of the current mapping** (fine for now, worth revisiting
if they become real gaps):
- Only the *first* linked testimonial renders, even if a Strapi entry has
  several — the template supports one testimonial block per page.
- No numeric `stats` block equivalent exists in the Strapi schema yet — that
  block just doesn't render for Strapi-sourced stories.
- Strapi's `case-story` schema has no `client` field, and the current
  template doesn't display one anyway, so it's left blank for Strapi
  entries.
- If a slug collides between a local `.md` file and a Strapi entry, the
  build fails loudly rather than silently picking one — rename one of them.

**Production Strapi**: not wired up yet. When ready, add
`STRAPI_PROD_URL`/`STRAPI_PROD_API_TOKEN` to `.env` (placeholders already in
`.env.example`) and extend `fetchStrapiCaseStudies()` in
`scripts/build-case-studies.js` to also query the prod instance.

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
- Hosting: Vercel, as a static site (no build command needed — generated
  files are committed to git, same as the hand-written pages)
- To connect auto-deploy: go to vercel.com/new, import this repo, framework
  preset "Other", leave build/output settings empty

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
