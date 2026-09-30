---
name: review-case-studies
description: Check whichever Strapi instance is configured in .env for case stories that are new or updated compared to what's live on the IncubXperts site, get explicit approval on what to publish, then open a Pull Request with those changes for a developer to review and merge. Use when asked to check for new case studies, review Strapi content, or publish/approve case studies.
---

# Review Case Studies

This repo's case-study pages are generated from a frozen, approved snapshot
in `data/case-studies-manifest.json` — **not** live from Strapi on every
build (see `scripts/build-case-studies.js`'s header comment for why). Your
content source is just a pool of *available* content; nothing from it goes
live until a human approves it through this workflow, and even then it only
ever reaches a review request — never straight to the live site. Never edit
`data/case-studies-manifest.json`, `case-studies/*.html`, `case-studies.html`,
`sitemap.xml`, or `llms.txt` by hand — they're only ever written by the
scripts below.

This skill is meant to work for anyone, technical or not. **Follow the
rules below on every single step, not just the ones that feel relevant in
the moment** — they exist because specific real confusion happened without
them.

## Always translate these terms — never show the raw ones

| Never say | Say instead |
|---|---|
| branch | private draft workspace |
| commit | save point |
| Pull Request | review request |
| manifest | the official published list |
| Strapi | your content source |
| environment | (see below — usually just omit the word) |

## Ask only when there's a real choice; state everything else as fact

There are exactly **two** points in this whole flow where you need the
user's input: what to publish (step 3), and a final go-ahead right before
anything is pushed (step 6). Everything else — which content source is
being checked, which target the review request will go to, how long a
step will take — is information you **state plainly**, not a question you
ask. If there's only one possible answer (e.g. only one target exists
today), say so as a fact; don't turn it into a confirmation prompt.

## If anything fails, at any step: stop, don't guess, don't retry silently

This is the most important rule in this skill. If a script or command
fails for any reason — bad `.env` formatting, an unreachable content
source, a failed safety check — **stop immediately**. Do not edit a file
to try to fix it, do not retry automatically, do not guess at a workaround.
The scripts below are already designed to fail with one complete, precise
message when something is wrong (file/line for a bad `.env` line, which
exact address couldn't be reached, whether a safety-check failure looks
like a real problem or a network hiccup). Relay that message to the user
**exactly and completely**, in a form they can copy-paste directly into a
message to a developer — and always reassure them that nothing has been
lost: nothing goes live until the very end of this flow, so a stop at any
point means their intended changes just haven't happened yet, not that
anything broke.

## 1. Check prerequisites

- Confirm the GitHub CLI is ready: run `gh auth status`. If it fails: tell
  the user this tool needs `gh` installed and logged in (`gh auth login`,
  an interactive step they need to do themselves) before it can open a
  review request, then stop.
- If `data/case-studies-manifest.json` doesn't exist yet: this looks like a
  first-time setup. Offer to run `node scripts/seed-case-studies-manifest.js`
  — this treats everything *currently* live as pre-approved so existing
  stories don't show up as "new." Only do this once, ever, per repo.
- You do **not** need to check `.env` values yourself — step 2's script
  does that automatically and stops with a complete, specific message if
  something's wrong (see the rule above). Don't pre-empt it.

## 2. Check what's new or changed

State upfront, once, before running anything: "I'm going to check your
content source for anything new or changed, then show you a short list to
approve. If you approve anything, I'll prepare it in a private draft
workspace and open a review request — nothing goes live until a developer
merges that request." This is the entire plan; you won't need to
re-explain it later.

Run:
```bash
node scripts/review-case-studies.js
```
It states which content source it's checking as its first line of output
— relay that plainly. If it stops with an error, follow the rule above:
relay its message exactly, don't attempt to fix anything yourself.

Present the result as a short numbered list, not a table or raw JSON:
```
1. AI Bootcamp platform update (Healthcare) — looks complete
2. Insurance claims assistant (Fintech) — missing a linked benefit, not blocking
3. ...
```
- **New and updated stories** go in this numbered list. For updated
  stories, fold in *what* changed as a short trailing clause (e.g. "— hero
  image and 2 benefits updated") rather than a separate diff section;
  only mention fields that actually changed. Warnings (missing hero image,
  no benefits linked, etc.) are a trailing note on the same line, never
  blockers, never their own list.
- **Unchanged** — just say the count in one line.
- **Orphaned** (if non-empty) — one line explaining plainly: these pages
  are still live but their entry is gone from this content source
  (possibly because it exists on a *different* one). Nothing gets removed
  automatically. If the script's output includes a `note` field flagging
  an unusually large orphaned count, surface that note prominently — it's
  telling you the wrong content source might be configured.
- **Errors** (if any) — one line per entry skipped for missing required
  fields.

Never paste the script's raw JSON, a "saved to file" system notice, or
any other raw tool output into the chat — always translate to the format
above. If a story's content is long, don't dump it into chat by default;
mention that `node scripts/review-case-studies.js --slug=<slug> --full`
shows one story's complete content for anyone who wants to read it in
full before deciding.

## 3. Ask what to approve

Ask which numbered items (if any) should be published — accept a list of
numbers, "all," specific titles, or "none." Don't assume "check" means
"publish everything found."

**If nothing is approved: stop here.** Say plainly that nothing changed —
no draft workspace, no save point, nothing pushed. This is a completely
normal, valid outcome.

## 4. Prepare the approved changes

State the target as a fact, not a question — check
`scripts/case-study-environments.js`; today there's only one entry
(production, going to `main`), so just say "this will go out for review
against production" and move on. Only ask if more than one target exists
by the time you're reading this.

```bash
git checkout main
git pull --ff-only origin main
git checkout -b case-studies/publish-<UTC timestamp, e.g. 20260925-143022>
```

Then run:
```bash
node scripts/publish-case-studies.js --slugs=<comma,separated,approved,slugs> --env=<environment id> --approved-by="<the user's name, if known, else 'unknown'>"
```
This states which content source it's checking (again — it never trusts
the earlier check, in case something changed since), re-fetches fresh,
mirrors media, updates the official published list, regenerates the site,
and stages exactly the changed files. If it stops with an error, follow
the rule above.

Report its summary in plain language — e.g. "prepared 3 stories, no
errors" — never the raw script output.

Commit what's staged:
```bash
git commit -m "Publish case studies: <slugs, comma separated>"
```

## 5. One last check before sending it out for review

Run `git diff --stat main` and summarize it in one line (e.g. "3 new
pages, plus the listing page and sitemap"). Remind them once, briefly: this
sends it out for review — **it does not publish anything by itself**. Get
an explicit go-ahead before continuing. This is the second and last real
confirmation in this whole flow.

## 6. Send it out for review

```bash
git push origin case-studies/publish-<timestamp>
```

If this fails for any reason, follow the standing rule above: relay
whatever message it gives exactly and completely, don't retry it yourself,
don't suggest `--no-verify`, and reassure them nothing was lost — the
user's approved changes are safely saved in the private draft workspace.
(Some developers choose to install an optional visual regression check
that runs automatically here — if so, its message will already distinguish
a genuine visual difference from a network/timeout problem; either way,
just relay it.)

Otherwise, open the review request:
```bash
gh pr create --base main --title "Publish N case studies: <slugs>" --body "<list of new/updated stories, approver name, timestamp>"
```

## 7. Wrap up

```bash
git checkout main
```
Report the review request's URL clearly as the final result. State
plainly: **a developer needs to review and merge this before any of it
goes live** — this skill's job ends here, not at deploying it.
