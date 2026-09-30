---
name: publish-events
description: Add or update an event on the IncubXperts Events page by editing data/events-source.json, then open a Pull Request with the regenerated page for a developer to review and merge. Use when asked to publish a new event, update an existing event, or add something to the Events page.
---

# Publish Events

Unlike case studies, Events has no external content source — `data/events-source.json`
**is** the source of truth. Publishing an event means: that file gets a new
or changed entry, `events.html` gets regenerated from it, and the change
goes out as a review request — never a direct push to the live site. Never
hand-edit `events.html`'s stats, filter counts, or `<article class="event-card">`
blocks directly; they're only ever written by `scripts/build-events.js`.

This skill is meant to work for anyone, technical or not. **Follow the
rules below on every step.**

## Always translate these terms — never show the raw ones

| Never say | Say instead |
|---|---|
| branch | private draft workspace |
| commit | save point |
| Pull Request | review request |
| pre-push hook | automatic visual safety check |

## Ask only when there's a real choice; state everything else as fact

There are exactly **two** points where you need the user's input: the
event details (step 2, including confirming the draft before saving), and
a final go-ahead right before anything is pushed (step 5). Everything
else — timing, what happens next — is stated plainly, not asked as a
question.

## If anything fails, at any step: stop, don't guess, don't retry silently

If a command fails for any reason — a build error, a failed safety check
— **stop immediately**. Don't edit a file to try to fix it, don't retry
automatically, don't guess at a workaround. Relay the failure message
exactly and completely, in a form the user could copy-paste into a message
to a developer, and reassure them that nothing has been lost: nothing goes
live until the very end of this flow.

## 1. Check prerequisites

- Confirm the GitHub CLI is ready: run `gh auth status`. If it fails: tell
  the user this tool needs `gh` installed and logged in (`gh auth login`,
  an interactive step they do themselves) before it can open a review
  request, then stop.

State upfront, once: "I'll draft the event details with you, save a
preview, then send it out for review — the last step includes an
automatic visual safety check that usually takes one to three minutes.
Nothing goes live until a developer merges the review request."

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
and get their okay before saving — this is the first of the two real
confirmations in this flow.

## 3. Build and check warnings

```bash
node scripts/build-events.js
```
This regenerates `events.html`'s stats, filter counts, and card list from
the file. If it stops with an error, follow the rule above — relay it
exactly, don't try to fix it yourself. Otherwise, report any warnings it
prints (missing photo, missing speakers, a status that isn't
"Upcoming"/"Past") as a short trailing note, in plain language — these are
advisory only, never blocking.

## 4. Prepare the approved changes

```bash
git checkout main
git pull --ff-only origin main
git checkout -b events/publish-<UTC timestamp, e.g. 20260928-143022>
```
(If step 2's edits were made before this point, re-apply the same JSON
change on this fresh draft workspace rather than assuming it's already
there.)

Re-run the build if needed, then:
```bash
git add data/events-source.json events.html
git commit -m "Publish event: <title>"
```

## 5. One last check before sending it out for review

Run `git diff --stat main` and summarize it in one line. Remind them once,
briefly: this sends it out for review — **it does not publish anything by
itself**. Get an explicit go-ahead before continuing. This is the second
and last real confirmation in this flow.

## 6. Send it out for review

```bash
git push origin events/publish-<timestamp>
```
This runs the automatic visual safety check (~1-3 minutes, as already
stated up front). Two outcomes:

- **It fails**: relay the safety check's own message exactly and
  completely — it distinguishes a genuine visual difference from a
  network/timeout problem, and states plainly that nothing was lost.
  Follow the rule above: don't retry it yourself, don't suggest
  `--no-verify`. Give the user the complete message to share with a
  developer, and stop here.
- **It succeeds**: open the review request —
  ```bash
  gh pr create --base main --title "Publish event: <title>" --body "<what changed, plain language>"
  ```

## 7. Wrap up

```bash
git checkout main
```
Report the review request's URL clearly as the final result. State
plainly: **a developer needs to review and merge this before the event
goes live** — this skill's job ends here, not at deploying it.
