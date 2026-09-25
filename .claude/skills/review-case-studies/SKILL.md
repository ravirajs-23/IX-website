---
name: review-case-studies
description: Check whichever Strapi instance is configured in .env for case stories that are new or updated compared to what's live on the IncubXperts site, get explicit approval on what to publish, then open a Pull Request with those changes for a developer to review and merge. Use when asked to check for new case studies, review Strapi content, or publish/approve case studies.
---

# Review Case Studies

This repo's case-study pages are generated from a frozen, approved snapshot
in `data/case-studies-manifest.json` — **not** live from Strapi on every
build (see `scripts/build-case-studies.js`'s header comment for why). Strapi
is just a pool of *available* content; nothing from it goes live until a
human approves it through this workflow, and even then it only ever reaches
a Pull Request — never `main` directly. Never edit
`data/case-studies-manifest.json`, `case-studies/*.html`, `case-studies.html`,
`sitemap.xml`, or `llms.txt` by hand — they're only ever written by the
scripts below.

This skill is meant to work for anyone, technical or not, who has this repo
cloned with Claude Code and a working `.env`. Explain things in plain
language — the person running this may not know git or CSS. Follow every
step; don't skip the confirmations even if the request sounds like "just
publish everything" — nothing goes live without an explicit yes, and even
that "yes" only produces a PR for someone else to actually merge.

## 1. Check prerequisites

- Confirm `STRAPI_URL` and `STRAPI_API_TOKEN` are set (in `.env`). If
  missing: tell the user to copy `.env.example` to `.env`, fill them in for
  whichever Strapi instance they want to check, then stop.
- Confirm the GitHub CLI is ready: run `gh auth status`. If it fails: tell
  the user this tool needs `gh` installed and logged in
  (`gh auth login`, an interactive step they need to do themselves) before
  it can open a Pull Request, then stop.
- If `data/case-studies-manifest.json` doesn't exist yet: this looks like a
  first-time setup. Offer to run `node scripts/seed-case-studies-manifest.js`
  — this treats everything *currently* live as pre-approved so existing
  stories don't show up as "new." Only do this once, ever, per repo.

## 2. Check what's new or changed

Run:
```bash
node scripts/review-case-studies.js
```
Parse the JSON it prints and present a clear, plain-language summary:

- **New stories** — title, category, tags, publish date, and any
  `warnings` (e.g. missing hero image, missing meta description, empty
  body, no benefits linked) shown as friendly notes, not blockers.
- **Updated stories** — same, plus which fields actually changed (each
  field's `diffText` is ready to show as-is: `{+added+}` / `[-removed-]`
  for text, `+`/`-` line prefixes for the body). Only mention fields that
  changed.
- **Unchanged** — just say the count, don't list every one unless asked.
- **Orphaned** (if non-empty) — explain plainly: these pages are still live
  but their Strapi entry is gone (renamed or deleted, possibly in a
  *different* Strapi instance than the one currently configured). This
  skill never removes a live page automatically — mention it and move on.
- **Errors** (if any) — Strapi entries skipped for missing required fields.

If a story's content is long, don't dump everything into chat by default —
summarize what changed, and mention that
`node scripts/review-case-studies.js --slug=<slug> --full` shows one
story's complete current + previously-approved content, for anyone who
wants to read it fully before deciding.

## 3. Ask what to approve

Ask in plain language which stories (if any) should be published — accept
something like "all the new ones," specific titles/slugs, or "none." Don't
assume "check" means "publish everything found."

**If nothing is approved: stop here.** Say plainly that nothing changed —
no branch, no commit, nothing pushed. This is a completely normal, valid
outcome.

## 4. Confirm the target

Check `scripts/case-study-environments.js`. Today there's only one entry
(Production, branch `main`) — state that plainly and confirm it's correct.
If more than one environment exists by the time you're reading this, ask
which one. This "environment" is which branch the eventual Pull Request
will target.

## 5. Prepare a branch with the approved changes

```bash
git checkout main
git pull --ff-only origin main
git checkout -b case-studies/publish-<UTC timestamp, e.g. 20260925-143022>
```

Then run:
```bash
node scripts/publish-case-studies.js --slugs=<comma,separated,approved,slugs> --env=<environment id> --approved-by="<the user's name, if known, else 'unknown'>"
```

This re-fetches Strapi fresh (never trusts the earlier check — something
could have changed again in the meantime), mirrors media, updates the
manifest, regenerates the site, and `git add`s exactly the changed files.
Report its summary output (published/skipped slugs).

Commit what's staged:
```bash
git commit -m "Publish case studies: <slugs, comma separated>"
```

## 6. Confirm before opening a Pull Request

Run `git diff --stat main` and show it. Explain plainly what's about to
happen: this will push a branch and open a Pull Request for a developer to
review — **it does not publish anything by itself**. Get explicit
confirmation before continuing.

## 7. Push and open the Pull Request

```bash
git push origin case-studies/publish-<timestamp>
```

This triggers this repo's mandatory pre-push hook (a full rebuild + visual
style check, ~1-3 minutes). Two outcomes:

- **It fails**: this means an automated check caught something looking
  visually wrong somewhere on the site — not necessarily related to the
  case studies just published. Explain this plainly to the user: nothing
  was lost (their approved changes are safely committed on the branch), but
  this needs a developer's help to diagnose, since it's a visual/CSS issue
  a non-technical person can't reasonably fix. **Never suggest bypassing it
  (`--no-verify`) to a non-technical user** — that defeats the point of the
  check. Stay on the branch and stop here.
- **It succeeds**: open the Pull Request —
  ```bash
  gh pr create --base main --title "Publish N case studies: <slugs>" --body "<list of new/updated stories, approver name, timestamp>"
  ```

## 8. Wrap up

```bash
git checkout main
```
Report the PR URL clearly as the final result. State plainly: **a developer
needs to review and merge this Pull Request before any of it goes live** —
this skill's job ends at opening the PR, not at deploying it.
