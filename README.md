# IncubXperts Website

A static HTML/CSS/JS corporate site, with a small build script that generates
case-study pages from simple content files.

```
incubxperts-website/
├── index.html, about.html, services.html, team.html,
│   blog.html, careers.html, contact.html   # hand-written pages
├── case-studies.html                        # GENERATED — case-study listing page
├── case-studies/<slug>.html                 # GENERATED — one page per case story
├── content/case-studies/<slug>.md           # you write these
├── images/case-studies/                     # images referenced by case stories
├── templates/template.html                  # shared page shell (don't hand-edit generated pages)
├── scripts/build-case-studies.js            # the build script
├── css/style.css, js/script.js
├── sitemap.xml, robots.txt, llms.txt        # sitemap.xml is GENERATED; the others are hand-maintained
└── package.json
```

**Never hand-edit files under `case-studies/` or `case-studies.html`** — they're
overwritten every time the build script runs. Edit the `.md` source file
instead.

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

## Editing the other pages

The 7 hand-written pages (`index.html`, `about.html`, etc.) aren't part of
the build system — edit their HTML directly, then `git add -A && git commit
&& git push` the same way.

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
