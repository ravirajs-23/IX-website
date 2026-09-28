# Publishing new content types without a developer

This repo now has two examples of letting a non-technical person add
content without touching HTML: **case studies** (`.claude/skills/review-case-studies/`)
and **events** (`.claude/skills/publish-events/`). Before building a third,
read this — it's a checklist, not a framework: the two pipelines
deliberately don't share code yet (see "Why no shared library yet" below),
so copy the shape below rather than trying to plug into existing code.

## 1. Decide where the content lives

- **Frequent updates, real editorial workflow, already has (or is worth
  building) a CMS presence** → a real Strapi content type, synced through a
  frozen local manifest with an explicit approve-before-publish step.
  See `data/case-studies-manifest.json`, `scripts/lib/case-studies-strapi-source.js`,
  `scripts/review-case-studies.js`.
- **Infrequent updates, small volume, no CMS need** → a structured data file
  (JSON) that the content owner edits directly, or dictates to Claude Code
  in chat. No backend to build. See `data/events-source.json`.

Either way: **one file (or a small, explicit set) is the single source of
truth.** Never HTML hand-edited in place.

## 2. Build a pure-render layer

A `scripts/lib/<type>-core.js` that turns the source data into the actual
page markup — **zero network access**, so it's safe to call from a build,
a test, or a debugging session without side effects. Pair it with a thin
`scripts/build-<type>.js` wrapper that:
- exports a `build<Type>()` function
- is guarded with `if (require.main === module) { ... }` — this repo hit a
  real incident where an unguarded script fired for real just from being
  `require()`'d during debugging; every CLI script here has this guard now
- gets added to `package.json`'s `build` script chain

If the page's content should never go fully silent about problems, add an
advisory-only warnings function (`getEventWarnings`, `getContentWarnings`)
— missing image, missing required field, etc. **Never make a warning
block the build.**

## 3. Wire the page in

- `scripts/build-pages.js`'s `PAGES` array — keeps the shared header/footer
  in sync on this page too.
- `scripts/lib/case-studies-core.js`'s `STATIC_PAGES` array — so it's in
  `sitemap.xml`.
- Nothing else. The pre-push hook (`scripts/hooks/pre-push`) already
  rebuilds the whole site and style-diffs it on every push — any new page
  is automatically covered, no per-page hook config needed.

## 4. Build a Claude Code skill, not a script the user runs blind

Every publish flow in this repo follows the same shape, regardless of
where the content came from:

1. Check prerequisites (`gh auth status`, any required `.env` values).
2. Gather/confirm the content (fetch+diff for a Strapi-backed type;
   conversationally draft the entry for a data-file-backed type).
3. Build, surface warnings in plain language.
4. Branch (never commit straight to `main`).
5. Commit, show `git diff --stat main`, get **explicit confirmation**
   before pushing.
6. Push — this fires the pre-push hook. On failure: explain plainly, stay
   on the branch, **never suggest `--no-verify` to a non-technical user**.
   On success: `gh pr create`.
7. Wrap up on `main`, report the PR URL, and say plainly that a developer
   still needs to merge it — the skill's job ends at the PR.

Write the skill for someone who doesn't know git or CSS. See
`.claude/skills/review-case-studies/SKILL.md` (Strapi-backed, longer,
has a diff/approval step) and `.claude/skills/publish-events/SKILL.md`
(data-file-backed, shorter, no external source to diff) as the two
reference shapes.

## Why no shared library yet

Case-studies and events *look* generalizable, but there's only one real
precedent for each half of the split (one Strapi-backed type, one
data-file-backed type). Extracting a shared interface now would mean
guessing at which parts are truly universal vs. coincidentally similar.
Once a **third** content type is built, revisit this: pull the genuinely
shared pieces (the skill's step skeleton, the guard/wrapper convention,
the "advisory warnings, never block" rule) into one place, and leave the
type-specific pieces (field mapping, HTML template, warning rules) apart.
