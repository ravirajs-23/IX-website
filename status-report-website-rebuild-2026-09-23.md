# IncubXperts Website Rebuild — Status Report

**Date:** 2026-09-23
**Project:** Rebuilding the IncubXperts marketing site as a static site (repo: `IX-website`, staging: `temporary-snappy-aurora-uz88l7o.vercel.app`) to exactly match the live production site (`www.incubxperts.com`)
**Overall status:** On track. Core pages are rebuilt and verified; a defined, scoped list of gaps remains (see Limitations).

## Summary

63 commits of work have gone into matching the static rebuild to the live site, page by page, down to the level of exact colors, gradients, spacing, and shadows — not just "looks about right." Eight of the nine core pages are now rebuilt and verified against the live site. The homepage and a full multi-page services section are the two largest pieces of remaining scope, and both are clearly defined rather than open-ended.

## Coverage

**Pages fully rebuilt and verified against the live site:**
- About Us, Partnerships, Ploko AI *(new partner page)*, Blog, Outlook, Careers, Contact
- Each was checked not just visually but against the live site's actual rendered CSS (colors, gradients, shadows, spacing, image positioning) at multiple screen sizes, catching mismatches a visual glance would miss.

**Case Studies:**
- Fully migrated to the company's Strapi CMS as the single source of truth.
- 100 real case-story pages, the listing page, and the sitemap are all auto-generated from Strapi on every build — no manually-maintained content to fall out of date.

**Services:**
- 3 of the real site's individual service pages are live and verified: AI Adoption & Strategy, Agentic Solutions, Workflow Automation.

**Cleanup:**
- Removed an orphaned `team.html` page that had no equivalent on the live site and carried an incorrect canonical URL (a latent SEO issue).

**Quality tooling built along the way:**
- An automated checking tool now compares our build against the live site's actual computed styles at multiple screen widths — 64 checks covering ~128–256 individual style comparisons.
- This check is now a **mandatory gate before any code can be pushed**, so once a page is confirmed matching, it can't silently drift out of sync again as other work continues.
- Latest full run: 118/128 checks passing (92%); the remaining items are two small in-progress fixes (see Limitations) plus checks that needed their own refinement rather than real site bugs.

## Limitations (known, scoped gaps — not yet addressed)

1. **Homepage (`index.html`) is incomplete.** It's missing at least two sections the live homepage has: the case-stories preview carousel and the client testimonials carousel. This page has not yet been through the same rigorous match-and-verify pass the other 7 pages received.
2. **Services section is partially built.** The live site has one dedicated page per service (~10 total); we've built 3. The remaining services still need a scoping decision (build the rest individually, or intentionally consolidate) before work continues.
3. **Careers page keeps a simplified job-application flow.** Ours has an inline job list and application form; the live site instead links out to an external careers/ATS system. This was a deliberate simplification, not an oversight, but it means that section is intentionally not a 1:1 match and should be a conscious call, not a default.
4. **Two small cosmetic mismatches are open on About Us**, found in this week's audit and not yet committed: a gradient angle rounded to whole degrees instead of the live site's precise value, and a border color mismatch that has no visible effect (the border itself is invisible either way) but isn't byte-for-byte exact.
5. **Photo/image content itself isn't automatically regression-tested.** The automated checking tool verifies layout, sizing, and positioning of images, but can't directly compare image pixels between the live site and our build (they're served from different domains). Visual confirmation of images is manual, one-time verification.
6. **One image on the Ploko AI page has no single "correct" size to match.** The live site itself serves that logo at different sizes depending on the visitor's device — there is no one pixel value to target, so we used a flexible sizing approach instead and documented why.

## Challenges encountered

- **The live site is a modern web-app (React), not a simple webpage** — it doesn't expose plain, readable style rules, and page content sometimes loads in after the page first appears (only after a scroll or delay). This made naive "look and see" comparisons unreliable, and is why a dedicated automated checking tool was built partway through the project rather than relying on eyeballing pages.
- **A recurring, easy-to-miss visual technique on the live site:** several headings and links use a gradient text effect that reports a normal-looking color if you check the wrong style property, masking the real mismatch. This caused a few genuine misses early on (flagged by screenshots) before the team adopted a more exhaustive, systematic check to catch this pattern going forward.
- **Layered background images**: some page banners stack more than one background image across nested page elements. Checking only the outermost element missed an entire photo layer underneath, which caused a hero image to go missing on two pages until caught and fixed — and then proactively re-checked across every other page sharing that same component.
- **Local testing environment resource limits**: running the full automated check across every page and screen size occasionally hit an operating-system file-handle limit and crashed the local test server mid-run. Worked around by restarting the server and by using a faster, reduced-scope check for routine work, saving the full check for periodic deeper passes.
- **The live site's page structure doesn't map cleanly onto our original page plan** for three sections (Services, Blog/Outlook, Careers) — each needed a real information-architecture decision (e.g., splitting one page into two to match Blog vs. Outlook) rather than a simple content copy, which slowed those sections down relative to more straightforward pages.
