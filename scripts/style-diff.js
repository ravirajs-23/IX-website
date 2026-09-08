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
const BREAKPOINTS = [
  { label: "mobile (375px)", width: 375, height: 900 },
  { label: "md (900px)", width: 900, height: 900 },
  { label: "lg (1200px)", width: 1200, height: 900 },
  { label: "xl (1536px)", width: 1536, height: 1000 },
];

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
    name: "Nav CTA button (\"Contact us\")",
    livePath: "/",
    oursPath: "/index.html",
    liveSelector: ".__contact-us",
    oursSelector: ".nav-cta .btn",
    props: ["padding", "fontSize", "fontWeight", "height"],
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
    name: "Eyebrow label (\"About Us\")",
    livePath: "/about-us",
    oursPath: "/about.html",
    liveMatchText: "About Us",
    oursSelector: ".eyebrow",
    props: ["fontSize", "fontWeight", "fontFamily"],
  },
  {
    name: "Generic tile card",
    livePath: "/",
    oursPath: "/index.html",
    liveSelector: ".box.MuiBox-root",
    oursSelector: ".card",
    props: ["padding", "borderRadius", "minHeight", "height"],
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
    name: "Case-study filter pill (active)",
    livePath: "/case-stories",
    oursPath: "/case-studies.html",
    liveMatchText: "All",
    oursSelector: ".cs-filter-pill.active",
    props: ["padding", "fontSize", "fontWeight", "borderRadius", "height"],
  },
  {
    name: "Case-study filter search box",
    livePath: "/case-stories",
    oursPath: "/case-studies.html",
    liveSelector: "input[placeholder]",
    oursSelector: ".cs-search",
    props: ["fontSize", "borderRadius", "height"],
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

async function getComputedProps(page, { selector, matchText, matchIncludes }, props) {
  return page.evaluate(
    (selector, matchText, matchIncludes, props) => {
      let el = null;
      if (matchText) {
        el = [...document.querySelectorAll("*")].find((e) => {
          if (e.children.length !== 0) return false;
          const text = e.textContent.trim();
          return matchIncludes ? text.includes(matchText) : text === matchText;
        });
      } else if (selector) {
        el = document.querySelector(selector);
      }
      if (!el) return null;
      const cs = getComputedStyle(el);
      const out = {};
      for (const p of props) out[p] = cs[p];
      return out;
    },
    selector || null,
    matchText || null,
    Boolean(matchIncludes),
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
        await new Promise((r) => setTimeout(r, 1500));
        live = await getComputedProps(
          page,
          {
            selector: scenario.liveSelector,
            matchText: scenario.liveMatchText,
            matchIncludes: scenario.matchIncludes,
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
