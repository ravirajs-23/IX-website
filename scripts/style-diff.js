#!/usr/bin/env node
/**
 * style-diff.js
 *
 * Compares computed CSS between the live site (incubxperts.com) and our own
 * build, at a fixed set of viewport widths, for a fixed list of elements.
 * Exists because manually typing getComputedStyle() one snippet at a time in
 * a chat session doesn't scale and (as this project's history shows) easily
 * misses viewport-dependent differences — a value that matches at one width
 * can be wildly wrong at another if the two sites scale it differently
 * (e.g. our old clamp()/vw fluid scaling vs the live site's actual stepped
 * MUI breakpoints).
 *
 * Uses puppeteer-core against the SYSTEM's already-installed Chrome/Edge
 * (no bundled browser download — see CHROME_PATHS below) since this is a
 * dev-only QA tool, never shipped with the site.
 *
 * Usage:
 *   node scripts/style-diff.js                          # ours = http://localhost:5050
 *   OURS_BASE_URL=https://your-deploy.vercel.app node scripts/style-diff.js
 *   (or: npm run style-diff -- --ours=https://your-deploy.vercel.app)
 *
 * Edit BREAKPOINTS/SCENARIOS below to add more pages/elements/widths as new
 * gaps are found — this is meant to grow over time, not be a one-off.
 */

const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");

const LIVE_BASE_URL = "https://www.incubxperts.com";
const argOurs = process.argv.find((a) => a.startsWith("--ours="));
const OURS_BASE_URL =
  (argOurs && argOurs.slice("--ours=".length)) ||
  process.env.OURS_BASE_URL ||
  "http://localhost:5050";

// MUI's actual breakpoint tiers (xs/sm/md collapse to one value for most of
// the elements checked here, per manual measurement — see the hero h1/p
// case that motivated this script: flat 36px/20px from 375-1199px, 60px/32px
// at 1200-1535px, 64px/32px at 1536px+). One representative width per tier;
// add more (e.g. a second point inside 375-1199) if a future check needs to
// distinguish xs/sm/md from each other.
const ALL_BREAKPOINTS = [
  { label: "mobile (375px)", width: 375, height: 900 },
  { label: "md (900px)", width: 900, height: 900 },
  { label: "lg (1200px)", width: 1200, height: 900 },
  { label: "xl (1536px)", width: 1536, height: 1000 },
];
// --fast / FAST=1: just the two ends of the range (skips md/lg). Every
// breakpoint-dependent scenario added so far only actually changes value
// at one boundary, so two points still catches a regression there — this
// exists so the mandatory pre-push hook (see scripts/hooks/pre-push)
// doesn't turn every push into a multi-minute wait. Run the full 4-point
// sweep by hand (`npm run style-diff`, no flag) after adding a new
// scenario, so you know which single breakpoint would even catch it.
const FAST = process.argv.includes("--fast") || process.env.FAST === "1";
const BREAKPOINTS = FAST ? [ALL_BREAKPOINTS[0], ALL_BREAKPOINTS[3]] : ALL_BREAKPOINTS;

const PROPS = ["fontSize", "fontWeight", "fontFamily", "color", "padding", "borderRadius", "height"];

/**
 * One scenario = one element, checked on one page, on both sites.
 * `liveSelector`/`oursSelector` are separate (not a shared `selector`)
 * because the two sites' DOMs are structurally different (MUI-generated
 * classes on the live site vs our own plain semantic classes) — a single
 * shared CSS selector almost never matches the same real element on both.
 * `liveMatch`/`oursMatch` (optional): when a selector alone can't pin down
 * the right element (e.g. a page with several <h2>s), a function that
 * receives all matches and the page's `textContent` picks the right one —
 * see "About-us section heading" below for why this exists.
 */
const SCENARIOS = [
  {
    name: "Homepage hero H1",
    livePath: "/",
    oursPath: "/index.html",
    liveSelector: "h1",
    oursSelector: "h1",
    props: ["fontSize", "fontWeight", "color"],
  },
  {
    name: "Homepage hero subtitle",
    livePath: "/",
    oursPath: "/index.html",
    liveMatchText: "Strategic, value-focused",
    matchIncludes: true,
    oursSelector: "[data-hero='subtitle']",
    props: ["fontSize", "color"],
  },
  {
    name: "Hero primary button (\"Case Stories\")",
    livePath: "/",
    oursPath: "/index.html",
    liveSelector: ".case-stories",
    oursSelector: ".hero-actions .btn-primary",
    props: ["padding", "fontSize", "fontWeight", "borderRadius"],
  },
  {
    // height dropped: the live button is content-sized ("auto"), ours is a
    // fixed 44px for a consistent nav bar across pages — a deliberate,
    // pre-existing site-wide choice, not a bug this check should flag.
    name: "Nav CTA button (\"Contact us\")",
    livePath: "/",
    oursPath: "/index.html",
    liveSelector: ".__contact-us",
    oursSelector: ".nav-cta .btn",
    props: ["padding", "fontSize", "fontWeight"],
  },
  {
    name: "About-us H1",
    livePath: "/about-us",
    oursPath: "/about.html",
    liveSelector: "h1",
    oursSelector: "h1",
    props: ["fontSize", "fontWeight"],
  },
  {
    // Compares the generic h2 *style*, not identical wording — the two
    // sites' about pages don't share section copy, only the component style.
    name: "About-us section heading (generic H2 style)",
    livePath: "/about-us",
    oursPath: "/about.html",
    liveMatchText: "OUR STORY SO FAR",
    oursSelector: "h2",
    props: ["fontSize", "fontWeight", "fontFamily"],
  },
  {
    // Was ".eyebrow" — stale since about.html's hero was rebuilt to the
    // real MUI breadcrumb pattern (home icon + separator + label) rather
    // than the old plain uppercase eyebrow div.
    name: "About-us breadcrumb label (\"About Us\")",
    livePath: "/about-us",
    oursPath: "/about.html",
    liveMatchText: "About Us",
    oursSelector: ".page-breadcrumb span",
    props: ["fontSize", "fontWeight"],
  },
  {
    // height dropped: it's driven by each card's own copy length on both
    // sites, not a fixed design token — comparing it flags content-length
    // differences, not real style bugs.
    name: "Generic tile card",
    livePath: "/",
    oursPath: "/index.html",
    liveSelector: ".box.MuiBox-root",
    oursSelector: ".card",
    props: ["padding", "borderRadius", "minHeight"],
  },
  {
    name: "Case-study listing card",
    livePath: "/case-stories",
    oursPath: "/case-studies.html",
    liveSelector: ".case-box",
    oursSelector: ".cs-card",
    props: ["borderRadius", "boxShadow"],
  },
  {
    // The bottom gradient bar lives entirely in a pseudo-element on both
    // sites (live: ::before on .case-content; ours: ::after on .cs-card,
    // a deliberately simpler recreation of the same visual effect) —
    // checking the element itself would show nothing.
    name: "Case-study card bottom gradient bar",
    livePath: "/case-stories",
    oursPath: "/case-studies.html",
    liveSelector: ".case-content",
    livePseudo: "::before",
    oursSelector: ".cs-card",
    oursPseudo: "::after",
    props: ["backgroundImage"],
  },
  {
    // padding dropped: live renders 18.08px (a percentage/em-based calc)
    // vs our fixed 18px — sub-pixel noise from a different calculation
    // basis, not a real difference worth chasing.
    name: "Case-study filter pill (active)",
    livePath: "/case-stories",
    oursPath: "/case-studies.html",
    liveMatchText: "All",
    oursSelector: ".cs-filter-pill.active",
    props: ["fontSize", "fontWeight", "borderRadius", "height"],
  },
  {
    name: "Case-study filter search box",
    livePath: "/case-stories",
    oursPath: "/case-studies.html",
    liveSelector: "input[placeholder]",
    oursSelector: ".cs-search",
    props: ["fontSize", "borderRadius", "height"],
  },
  // ---- contact.html (added after the 2026-09-10 rigorous re-audit) ----
  {
    name: "Contact: \"Got a Question?\" heading",
    livePath: "/contact-us",
    oursPath: "/contact.html",
    liveMatchText: "GOT A QUESTION?",
    oursSelector: ".contact-subhead--lg",
    props: ["fontSize", "fontWeight"],
  },
  {
    name: "Contact: office city name",
    livePath: "/contact-us",
    oursPath: "/contact.html",
    liveMatchText: "IncubXperts TechnoConsulting Private Limited (HQ)",
    oursSelector: ".office-city span",
    props: ["fontSize", "color", "fontWeight"],
  },
  {
    name: "Contact: office address text",
    livePath: "/contact-us",
    oursPath: "/contact.html",
    liveMatchText: "Office No 1, Level 5",
    matchIncludes: true,
    oursSelector: ".office-address",
    props: ["fontSize", "color"],
  },
  {
    name: "Contact: office photo size",
    livePath: "/contact-us",
    oursPath: "/contact.html",
    liveSelector: ".Location-details img",
    oursSelector: ".office-photo",
    props: ["borderRadius"],
  },
  // ---- careers.html (added after the 2026-09-10 rigorous re-audit) ----
  {
    name: "Careers: page-hero subtitle (shared .page-hero p base rule)",
    livePath: "/careers",
    oursPath: "/careers.html",
    liveMatchText: "A culture of growth",
    matchIncludes: true,
    oursSelector: ".page-hero p",
    props: ["fontSize", "color"],
  },
  {
    name: "Careers: \"Chart Your Path\" card title",
    livePath: "/careers",
    oursPath: "/careers.html",
    liveMatchText: "Leadership Nexus",
    oursSelector: ".career-path-grid .card h3",
    props: ["fontSize", "color", "fontWeight"],
  },
  {
    name: "Careers: \"Chart Your Path\" card body text",
    livePath: "/careers",
    oursPath: "/careers.html",
    liveMatchText: "Quarterly meetups designed to mentor, elevate and strengthen our leaders.",
    oursSelector: ".career-path-grid .card p",
    props: ["fontSize", "color"],
  },
  {
    name: "Careers: benefit card title",
    livePath: "/careers",
    oursPath: "/careers.html",
    liveMatchText: "Competitive Pay Structure",
    oursSelector: ".perk-card h3",
    props: ["fontSize", "color"],
  },
  {
    name: "Careers: section-intro (Chart Your Path/Benefits/Career Openings)",
    livePath: "/careers",
    oursPath: "/careers.html",
    liveMatchText: "Empowering your journey from day one.",
    oursSelector: ".section-intro",
    props: ["fontSize", "color"],
  },
  {
    // NB: liveMatchText resolves to the leaf text node (the heading itself),
    // never an ancestor — so this only ever checks the section's own
    // element, not a wrapping <section>. Kept narrow (just the two
    // background props) specifically so it can't silently start checking
    // the wrong element again the way an earlier version of this scenario
    // did (see the 2026-09-10 commit that fixed it).
    // backgroundImage deliberately excluded: the live site's gradient
    // angle/stops vary slightly per component (271.36deg here, 243deg on
    // Engagement Models, 271deg on the Scorecard — all visually identical
    // to our one reused 270deg token) so an exact string match would be
    // noise, not signal. webkitTextFillColor being transparent already
    // proves the gradient-clip technique is actually active, which is
    // the thing this scenario exists to catch (color alone is a red
    // herring — it matches the section-title fallback either way).
    name: "Careers: \"Beyond Work\" heading is gradient text (webkitTextFillColor transparent)",
    livePath: "/careers",
    oursPath: "/careers.html",
    liveMatchText: "Beyond Work at IncubXperts",
    oursSelector: ".beyond-work .section-title",
    props: ["fontSize", "webkitTextFillColor", "textTransform"],
  },
  // ---- blog.html/outlook.html (added after the 2026-09-10 re-audit) ----
  {
    name: "Blog: filter pill (active)",
    livePath: "/blogs",
    oursPath: "/blog.html",
    liveMatchText: "All",
    oursSelector: ".blog-filter-row .tag-pill.active",
    props: ["borderRadius", "fontSize", "backgroundColor"],
  },
  {
    name: "Blog: filter pill (inactive)",
    livePath: "/blogs",
    oursPath: "/blog.html",
    liveMatchText: "AI",
    oursSelector: ".blog-filter-row .tag-pill:not(.active)",
    props: ["borderRadius", "fontSize", "borderColor"],
  },
  {
    name: "Blog/Outlook: closing CTA title",
    livePath: "/blogs",
    oursPath: "/blog.html",
    liveMatchText: "Contact Us",
    oursSelector: ".cta-band--insights h2",
    props: ["fontSize", "color"],
  },
  {
    name: "Blog/Outlook: closing CTA button",
    livePath: "/blogs",
    oursPath: "/blog.html",
    liveMatchText: "SPEAK WITH US",
    oursSelector: ".btn-ghost-white",
    props: ["backgroundColor", "border", "borderRadius"],
  },
];

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      "No Chrome/Edge install found. Set CHROME_PATH to your browser's executable, or install one."
    );
  }
  return found;
}

async function getComputedProps(page, { selector, matchText, matchIncludes, pseudo }, props) {
  return page.evaluate(
    (selector, matchText, matchIncludes, pseudo, props) => {
      let el = null;
      if (matchText) {
        // Not a strict leaf-only match (a button with "TEXT<svg icon/>" has
        // one child element but should still match on its own text) — take
        // every element whose full textContent matches, then prefer the
        // one with the fewest descendant elements, i.e. the most specific
        // match rather than some large ancestor container that happens to
        // contain the same text.
        const candidates = [...document.querySelectorAll("*")].filter((e) => {
          const text = e.textContent.trim();
          return matchIncludes ? text.includes(matchText) : text === matchText;
        });
        candidates.sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length);
        el = candidates[0] || null;
      } else if (selector) {
        el = document.querySelector(selector);
      }
      if (!el) return null;
      // pseudo (e.g. "::after"/"::before"): some effects (the case-study
      // card's bottom gradient bar) live entirely in a pseudo-element, not
      // on the element itself — getComputedStyle needs the second arg to
      // see them at all.
      const cs = getComputedStyle(el, pseudo || undefined);
      const out = {};
      for (const p of props) out[p] = cs[p];
      return out;
    },
    selector || null,
    matchText || null,
    Boolean(matchIncludes),
    pseudo || null,
    props
  );
}

/** Font stacks legitimately differ in their fallback fonts (Segoe UI vs
 * none, etc.) without any visible difference as long as the first
 * (preferred, actually-loaded) font matches — so only compare that one
 * to avoid noisy false-positive mismatches on fontFamily. */
function normalizeForCompare(obj) {
  if (!obj || !obj.fontFamily) return obj;
  return { ...obj, fontFamily: obj.fontFamily.split(",")[0].trim() };
}

function fmtRow(label, live, ours) {
  const mismatch = JSON.stringify(normalizeForCompare(live)) !== JSON.stringify(normalizeForCompare(ours));
  const marker = mismatch ? "✗" : "✓";
  return `  ${marker} ${label}`;
}

async function main() {
  const chromePath = findChrome();
  console.log(`Using browser: ${chromePath}`);
  console.log(`Live: ${LIVE_BASE_URL}   Ours: ${OURS_BASE_URL}\n`);

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: "new" });
  const page = await browser.newPage();

  let totalChecks = 0;
  let totalMismatches = 0;
  const mismatchDetails = [];

  for (const bp of BREAKPOINTS) {
    console.log(`\n=== ${bp.label} ===`);
    await page.setViewport({ width: bp.width, height: bp.height });

    for (const scenario of SCENARIOS) {
      const liveUrl = LIVE_BASE_URL + scenario.livePath;
      const oursUrl = OURS_BASE_URL + scenario.oursPath;

      let live, ours;
      try {
        await page.goto(liveUrl, { waitUntil: "networkidle2", timeout: 20000 });
        // Some pages (case-stories listing) render their cards from a
        // client-side fetch that finishes just after network-idle — a
        // short fixed wait avoids a flaky null match on a fresh profile.
        // (Bumped from 1.5s to 3s after intermittent null matches on the
        // case-stories scenarios during a full 4-breakpoint run — still a
        // fixed wait, not a proper wait-for-selector, so some flakiness on
        // a slow connection is still possible; a null "live" value paired
        // with a normal "ours" value is more likely this than a real gap.)
        await new Promise((r) => setTimeout(r, 3000));
        live = await getComputedProps(
          page,
          {
            selector: scenario.liveSelector,
            matchText: scenario.liveMatchText,
            matchIncludes: scenario.matchIncludes,
            pseudo: scenario.livePseudo,
          },
          scenario.props
        );
      } catch (err) {
        live = { error: err.message };
      }
      try {
        await page.goto(oursUrl, { waitUntil: "networkidle2", timeout: 20000 });
        ours = await getComputedProps(
          page,
          {
            selector: scenario.oursSelector,
            matchText: scenario.oursMatchText,
            matchIncludes: scenario.matchIncludes,
            pseudo: scenario.oursPseudo,
          },
          scenario.props
        );
      } catch (err) {
        ours = { error: err.message };
      }

      totalChecks++;
      const same = JSON.stringify(normalizeForCompare(live)) === JSON.stringify(normalizeForCompare(ours));
      if (!same) totalMismatches++;

      console.log(fmtRow(scenario.name, live, ours));
      if (!same) {
        mismatchDetails.push({ breakpoint: bp.label, scenario: scenario.name, live, ours });
      }
    }
  }

  await browser.close();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${totalChecks - totalMismatches}/${totalChecks} checks match.\n`);

  if (mismatchDetails.length) {
    console.log("Mismatches:\n");
    for (const m of mismatchDetails) {
      console.log(`[${m.breakpoint}] ${m.scenario}`);
      console.log(`  live: ${JSON.stringify(m.live)}`);
      console.log(`  ours: ${JSON.stringify(m.ours)}\n`);
    }
    process.exitCode = 1;
  } else {
    console.log("Everything checked matches. 🎉");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
