---
name: publish-case-studies
description: Review case stories that are new or updated in Strapi vs. what's live on the IncubXperts site, get explicit human approval, then publish them (commit + push). Use when asked to check for new case studies, review Strapi content, or publish/approve case studies.
---

# Publish Case Studies

This repo's case-study pages are generated from a frozen, approved snapshot
in `data/case-studies-manifest.json` — **not** live from Strapi on every
build (see `scripts/build-case-studies.js`'s header comment for why). Strapi
is just a pool of *available* content; nothing from it goes live until a
human approves it through this workflow. Never edit
`data/case-studies-manifest.json`, `case-studies/*.html`, `case-studies.html`,
`sitemap.xml`, or `llms.txt` by hand — they're only ever written by the
scripts below.

Follow these steps. Don't skip the confirmation steps even if the request
sounds like "just publish everything" — the whole point of this workflow is
that nothing goes live without an explicit yes from the person you're
talking to.

## 1. Check prerequisites

Confirm `STRAPI_URL` and `STRAPI_API_TOKEN` are set (a local `.env` file, or
already in the shell env). If missing, tell the user to copy `.env.example`
to `.env` and fill them in, then stop.

If `data/case-studies-manifest.json` doesn't exist yet, tell the user this
looks like a first-time setup and offer to run
`node scripts/seed-case-studies-manifest.js` — this treats everything
*currently* live as pre-approved so existing stories don't show up as
"new." Only do this once, ever, per repo.

## 2. Review

Run:
```bash
node scripts/review-case-studies.js
```
Parse the JSON it prints. Present a clear summary in chat:

- **New** — title, category, tags, publish date, and any `warnings` (e.g.
  missing hero image, missing meta description, empty body, no benefits
  linked) shown as advisory notes, not blockers.
- **Updated** — same, plus the changed fields from `diff` (each field's
  `diffText` is ready to print in a code block: `{+added+}` / `[-removed-]`
  for text, `+`/`-` line prefixes for the body). Only changed fields are
  present — say plainly which fields changed.
- **Unchanged** — just the count (don't list all of them unless asked).
- **Orphaned** (if non-empty) — mention plainly: these pages are still live
  but their Strapi entry is gone (renamed or deleted elsewhere). This
  workflow never removes a live page automatically — flag it and suggest
  asking an engineer if it should come down, then move on.
- **Errors** (if any) — Strapi entries skipped for missing required fields.

If a story's body is long, don't dump the whole diff/body into chat by
default — show what changed, and mention that
`node scripts/review-case-studies.js --slug=<slug> --full` gives the
complete current + previously-approved content for anyone who wants to
read a story in full before deciding.

## 3. Ask what to approve

Ask the user which slugs to publish — accept a plain-language answer
("all new", specific slugs, "none", "the update to X but not Y"). Don't
assume "review" implies "publish everything reviewed."

If nothing is approved, stop here — that's a valid outcome.

## 4. Confirm the environment

Check `scripts/case-study-environments.js`. Today there's only one entry
(Production, `main` branch) — state that plainly and confirm it's correct
before proceeding (this is the seam that lets a Staging entry be added
later without changing this workflow). If more than one environment
exists by the time you're reading this, ask which one.

## 5. Run the publish script

```bash
node scripts/publish-case-studies.js --slugs=<comma,separated,approved,slugs> --env=<environment id> --approved-by="<the user's name, if known, else 'unknown'>"
```

This re-fetches Strapi fresh (never trusts the earlier review — a slug
could have changed again in the meantime), mirrors media, updates the
manifest, regenerates the site, and `git add`s exactly the changed files.
**It does not commit or push.** Report its summary output (published /
skipped slugs) to the user.

## 6. Confirm before going live

Run `git diff --cached --stat` and show it. Explicitly ask for confirmation
before committing/pushing — this is the actual "go live" action (pushes to
the shared `main` branch and triggers a real deploy), and stays its own
visible confirmation step even though the content was already approved in
step 3.

## 7. Commit and push

On confirmation:
```bash
git pull --ff-only origin main
git commit -m "Publish case studies: <slugs, comma separated>"
git push origin main
```
The push triggers this repo's mandatory pre-push hook (a full rebuild +
style-diff check, ~1-3 minutes) — let it run and report the outcome. Never
add `--no-verify` unless the user explicitly asks for it.

If the push is rejected (someone else published in the meantime): pull and
retry once. If it still fails, stop and tell the user to re-run the review
— don't force-push.

## 8. Report the result

State clearly what's now live (or, on failure, exactly what failed and that
nothing was lost — the manifest update and local commit are still there to
retry).
