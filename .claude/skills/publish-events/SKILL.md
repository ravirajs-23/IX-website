---
name: publish-events
description: Add or update an event on the IncubXperts Events page by editing data/events-source.json, then open a Pull Request with the regenerated page for a developer to review and merge. Use when asked to publish a new event, update an existing event, or add something to the Events page.
---

# Publish Events

Unlike case studies, Events has no external content source (no Strapi
content type exists for it) — `data/events-source.json` **is** the source
of truth. Publishing an event means: that file gets a new or changed entry,
`events.html` gets regenerated from it, and the change goes out as a Pull
Request — never a direct push to `main`. Never hand-edit `events.html`'s
stats, filter counts, or `<article class="event-card">` blocks directly;
they're only ever written by `scripts/build-events.js`.

This skill is meant to work for anyone, technical or not, who has this repo
cloned with Claude Code and (eventually) a working `gh` login. Explain
things in plain language.

## 1. Check prerequisites

- Confirm the GitHub CLI is ready: run `gh auth status`. If it fails: tell
  the user this tool needs `gh` installed and logged in (`gh auth login`,
  an interactive step they do themselves) before it can open a Pull
  Request, then stop.

## 2. Gather the event's details

Ask what's changing: a brand-new event, or an update to an existing one
(e.g. moving something from Upcoming to Past after it happens). For a new
event, collect in plain conversation — don't demand JSON from the user:

- Status (`Upcoming` or `Past`), type (Summit, Forum, Roundtable, etc.),
  date, location
- Speakers (names, plus title/role if given)
- Expected/actual attendee count
- Title, one-line subtitle, a short description
- One or more image URLs for the gallery (first one is the card's main
  photo)

Draft the new object yourself and add it to the `data/events-source.json`
array (append for a new event; edit in place for an update) — match the
existing entries' shape exactly. Show the user what you're about to write
before saving.

## 3. Build and check warnings

```bash
node scripts/build-events.js
```
This regenerates `events.html`'s stats, filter counts, and card list from
the file. Report any warnings it prints (missing photo, missing speakers,
a status that isn't "Upcoming"/"Past") in plain language — these are
advisory only, never blocking.

## 4. Prepare a branch

```bash
git checkout main
git pull --ff-only origin main
git checkout -b events/publish-<UTC timestamp, e.g. 20260928-143022>
```
(If step 2's edits were made before this point, re-apply the same JSON
change on this fresh branch rather than assuming it's already there.)

Re-run the build if needed, then:
```bash
git add data/events-source.json events.html
git commit -m "Publish event: <title>"
```

## 5. Confirm before opening a Pull Request

Run `git diff --stat main` and show it. Explain plainly: this will push a
branch and open a Pull Request for a developer to review — **it does not
publish anything by itself**. Get explicit confirmation before continuing.

## 6. Push and open the Pull Request

```bash
git push origin events/publish-<timestamp>
```
This triggers the repo's mandatory pre-push hook (full rebuild + visual
style check, ~1-3 minutes). Two outcomes:

- **It fails**: an automated check caught something looking visually wrong
  somewhere on the site. Explain plainly: nothing was lost (the change is
  safely committed on the branch), but this needs a developer's help to
  diagnose. **Never suggest bypassing it (`--no-verify`) to a non-technical
  user.** Stay on the branch and stop here.
- **It succeeds**: open the Pull Request —
  ```bash
  gh pr create --base main --title "Publish event: <title>" --body "<what changed, plain language>"
  ```

## 7. Wrap up

```bash
git checkout main
```
Report the PR URL clearly as the final result. State plainly: **a developer
needs to review and merge this Pull Request before the event goes live** —
this skill's job ends at opening the PR, not at deploying it.
