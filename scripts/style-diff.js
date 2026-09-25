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
    // Was a plain white text card before 2026-09-11 (a "known
    // simplification" that turned out to just be an unfixed gap once
    // asked about directly) — the real card is an image with the title
    // overlaid, revealing a full gradient panel on :hover. Checks the
    // *default* (non-hover) state.
    name: "Blog: card title over image (default, non-hover state)",
    livePath: "/blog",
    oursPath: "/blog.html",
    liveMatchText: "AI-Native vs. AI-Added: The Difference That Actually Matters",
    oursSelector: ".blog-card-title",
    props: ["fontSize", "color", "fontWeight"],
  },
  {
    name: "Blog: card hover-reveal starts hidden (opacity/visibility)",
    livePath: "/blog",
    oursPath: "/blog.html",
    liveSelector: ".box-hover-content",
    oursSelector: ".blog-card-hover",
    props: ["opacity", "visibility"],
  },
  {
    // liveMatchText: "All" was wrong — the live site's default-active pill
    // is actually "AI", not "All" (confirmed directly: cleared localStorage's
    // selectedTag and reloaded, it re-selects "AI" on a clean load, so it's
    // the real hardcoded default). Matching "All" happened to find the
    // (inactive) All pill and compare its plain styling against our active
    // pill's blue background, a false mismatch — select by the live site's
    // own `.active` class instead so this keeps working if the default ever
    // changes again. blog.html's own default active pill was also switched
    // from "All" to "AI" to match.
    name: "Blog: filter pill (active)",
    livePath: "/blog",
    oursPath: "/blog.html",
    liveSelector: ".share-btn.active",
    oursSelector: ".blog-filter-row .tag-pill.active",
    props: ["borderRadius", "fontSize", "backgroundColor"],
  },
  {
    name: "Blog: filter pill (inactive)",
    livePath: "/blog",
    oursPath: "/blog.html",
    liveMatchText: "AI",
    oursSelector: ".blog-filter-row .tag-pill:not(.active)",
    props: ["borderRadius", "fontSize", "borderColor"],
  },
  {
    name: "Blog/Outlook: closing CTA title",
    livePath: "/blog",
    oursPath: "/blog.html",
    liveMatchText: "Contact Us",
    oursSelector: ".cta-band--insights h2",
    props: ["fontSize", "color"],
  },
  {
    name: "Blog/Outlook: closing CTA button",
    livePath: "/blog",
    oursPath: "/blog.html",
    liveMatchText: "SPEAK WITH US",
    oursSelector: ".btn-ghost-white",
    props: ["backgroundColor", "border", "borderRadius"],
  },
  // Partnerships (new 2026-09-17): distinct hero + card components, not
  // reusing .page-hero/.card — confirmed via computed style rather than
  // approximated. Not covered here: the About Us nav mega-menu's
  // hover-reveal content (Company/Leadership/Partnerships list) — the
  // live site's flyout resisted every simulated-hover/click technique
  // tried against it in an automated context (it took an unreliable
  // number of attempts even manually), so wiring a reliable, non-flaky
  // click-then-check into this script wasn't attempted; that component's
  // match was confirmed once by hand instead (see the header partial's
  // comment) rather than added to this regression suite.
  {
    name: "Partnerships: hero title",
    livePath: "/partnerships",
    oursPath: "/partnerships.html",
    liveSelector: "h1",
    oursSelector: ".partnership-hero__title",
    props: ["fontSize", "color", "fontWeight", "lineHeight"],
  },
  {
    name: "Partnerships: hero subtitle",
    livePath: "/partnerships",
    oursPath: "/partnerships.html",
    liveMatchText: "Strategic alliances that extend",
    matchIncludes: true,
    oursSelector: ".partnership-hero__subtitle",
    props: ["fontSize", "color", "fontWeight"],
  },
  {
    // Was checking `color` (a red herring here — see the HTML comment
    // above the card in partnerships.html for how that was caught):
    // this is gradient text via -webkit-text-fill-color:transparent, so
    // `color` reads back a plausible-looking but irrelevant value on
    // both sides and "passes" without ever checking what's really
    // painted. webkitTextFillColor/backgroundImage are the real signal.
    name: "Partnerships: partner tag (PLOKO) is gradient text",
    livePath: "/partnerships",
    oursPath: "/partnerships.html",
    liveMatchText: "PLOKO",
    oursSelector: ".partner-tag",
    props: ["fontSize", "fontWeight", "webkitTextFillColor", "backgroundImage"],
  },
  {
    name: "Partnerships: partner heading",
    livePath: "/partnerships",
    oursPath: "/partnerships.html",
    liveMatchText: "Ploko: Driving Digital Growth through AI",
    oursSelector: ".partner-heading",
    props: ["fontSize", "color", "fontWeight", "lineHeight"],
  },
  {
    name: "Partnerships: partner logo box (fixed size, object-fit:fill)",
    livePath: "/partnerships",
    oursPath: "/partnerships.html",
    liveSelector: "img[alt='Ploko logo']",
    oursSelector: ".partner-logo",
    props: ["height", "objectFit"],
  },
  {
    // Same red-herring fix as the tag above — this is gradient text too,
    // not the "unstyled default blue" an earlier pass concluded from
    // checking only `color`.
    name: "Partnerships: read-more link is gradient text",
    livePath: "/partnerships",
    oursPath: "/partnerships.html",
    liveMatchText: "READ MORE",
    oursMatchText: "READ MORE",
    props: ["webkitTextFillColor", "backgroundImage"],
  },
  {
    name: "Partnerships: hero illustration layer (background-size)",
    livePath: "/partnerships",
    oursPath: "/partnerships.html",
    liveSelector: ".partnership-hero-wrapper",
    oursSelector: ".partnership-hero__illustration",
    props: ["backgroundSize", "backgroundPosition", "backgroundRepeat"],
  },
  // Ploko AI detail page (new 2026-09-18): a bespoke design distinct from
  // every other page's shared .page-hero/.card patterns — confirmed via
  // computed style, same rigor as partnerships.html. Caught two real
  // font-size mistakes during that verification (a wrong mobile step for
  // the closing banner title, and a wrong desktop size for the
  // gradient-text column headings) that these scenarios would have
  // caught automatically had they existed first.
  {
    name: "Ploko AI: hero title",
    livePath: "/ploko-ai",
    oursPath: "/ploko-ai.html",
    liveSelector: "h1",
    oursSelector: ".ploko-hero__title",
    props: ["fontSize", "color", "fontWeight", "lineHeight"],
  },
  {
    name: "Ploko AI: hero badge",
    livePath: "/ploko-ai",
    oursPath: "/ploko-ai.html",
    liveMatchText: "European AI Implementation Partner",
    oursSelector: ".ploko-hero__badge",
    props: ["fontSize", "color", "borderRadius"],
  },
  {
    // Not checking size/object-fit here: confirmed this box's live size
    // is itself DPR-dependent (437x125 at DPR 1.25, 640x320 via
    // puppeteer's DPR 1, a different Next.js Image variant each time) —
    // an unstable ground truth on the live site, so asserting one exact
    // value would just be a coin-flip mismatch. display:none-on-mobile
    // is the one stable, real property here.
    name: "Ploko AI: about logo hidden on mobile",
    livePath: "/ploko-ai",
    oursPath: "/ploko-ai.html",
    liveSelector: ".about-ploko__logo",
    oursSelector: ".about-ploko__logo",
    props: ["display"],
  },
  {
    name: "Ploko AI: partnership column title (gradient text)",
    livePath: "/ploko-ai",
    oursPath: "/ploko-ai.html",
    liveMatchText: "IncubXperts",
    oursSelector: ".partnership__col-title",
    props: ["fontSize", "webkitTextFillColor"],
  },
  {
    name: "Ploko AI: European Expertise approach banner text",
    livePath: "/ploko-ai",
    oursPath: "/ploko-ai.html",
    liveMatchText: "This practical approach to implementation is what distinguishes Ploko as a trusted European AI agency focused on business outcomes.",
    oursSelector: ".euro-expertise__approach p",
    props: ["fontSize", "color", "fontWeight"],
  },
  {
    name: "Ploko AI: closing banner title",
    livePath: "/ploko-ai",
    oursPath: "/ploko-ai.html",
    liveMatchText: "Turning Opportunity Into Outcomes",
    oursSelector: ".ploko-supports__banner-title",
    props: ["fontSize", "color", "fontWeight"],
  },
  {
    name: "Ploko AI: closing banner link",
    livePath: "/ploko-ai",
    oursPath: "/ploko-ai.html",
    liveMatchText: "LET'S TALK",
    oursMatchText: "TALK",
    matchIncludes: true,
    oursSelector: ".ploko-supports__banner-link",
    props: ["color", "backgroundColor", "borderRadius"],
  },
  // These 4 were caught by a user-reported visual side-by-side AFTER the
  // first "confirmed" pass — an exhaustive backgroundImage sweep across
  // every element (not just the ones assumed to have one) turned up a
  // whole extra illustration layer plus two gradient-border effects that
  // targeted getComputedStyle checks had missed entirely. Not comparing
  // raw backgroundImage url()s here (hostnames differ between live/ours
  // so they'd never string-match) — backgroundSize/gradient values don't
  // embed a host and compare directly.
  {
    name: "Ploko AI: hero illustration layer (background-size)",
    livePath: "/ploko-ai",
    oursPath: "/ploko-ai.html",
    liveSelector: ".ploko-hero-wrapper",
    oursSelector: ".ploko-hero__illustration",
    props: ["backgroundSize", "backgroundPosition", "backgroundRepeat"],
  },
  {
    name: "Ploko AI: Digital Growth section background (not the site-wide alt gray)",
    livePath: "/ploko-ai",
    oursPath: "/ploko-ai.html",
    liveSelector: ".digital-growth-main",
    oursSelector: ".digital-growth-section",
    props: ["backgroundColor"],
  },
  {
    name: "Ploko AI: partnership divider is a gradient, not solid gray",
    livePath: "/ploko-ai",
    oursPath: "/ploko-ai.html",
    liveSelector: ".partnership__divider",
    oursSelector: ".partnership__divider",
    props: ["backgroundImage"],
  },
  {
    name: "Ploko AI: European Expertise point has a gradient border",
    livePath: "/ploko-ai",
    oursPath: "/ploko-ai.html",
    liveSelector: ".europian-expertise__middle-point",
    oursSelector: ".euro-expertise__point",
    props: ["backgroundImage", "borderRadius"],
  },
  // ---- about.html (added 2026-09-18, exhaustive backgroundImage/
  // boxShadow sweep — the same technique that found ploko-ai.html and
  // partnerships.html's missing hero illustrations, run here after the
  // user asked for the same check on every hand-built page) ----
  {
    // "ENGAGEMENT MODELS" is a distinct component (class __engagement_title)
    // with its own 243deg gradient, not the standard .section-title 270deg
    // one it visually resembles — missed on the original about.html pass.
    name: "About-us: Engagement Models heading (distinct 243deg gradient)",
    livePath: "/about-us",
    oursPath: "/about.html",
    liveMatchText: "ENGAGEMENT MODELS",
    oursSelector: ".engagement-title",
    props: ["fontSize", "webkitTextFillColor", "backgroundImage"],
  },
  {
    name: "About-us: timeline card shadow",
    livePath: "/about-us",
    oursPath: "/about.html",
    liveSelector: ".timeline-content",
    oursSelector: ".history-card ul",
    props: ["boxShadow"],
  },
  {
    // Live's final computed shadow/padding turned out to be a single soft
    // shadow + 20px padding, not the MuiPaper-elevation1 compound shadow
    // + base .card's 24px an earlier pass had assumed.
    name: "About-us: Engagement Models card shadow/padding",
    livePath: "/about-us",
    oursPath: "/about.html",
    liveSelector: ".__card-subwrap",
    oursSelector: "#engagement .card",
    props: ["boxShadow", "padding"],
  },
  {
    // .person-card was inheriting the base .card's border instead of the
    // live site's real border:none + MuiPaper-elevation1 shadow.
    name: "About-us: Leadership card shadow (not the base .card border)",
    livePath: "/about-us",
    oursPath: "/about.html",
    liveSelector: ".__leadership-card",
    oursSelector: ".person-card",
    props: ["boxShadow", "border"],
  },
  // ---- careers.html/contact.html/blog.html/outlook.html (added
  // 2026-09-18, same exhaustive sweep extended to every remaining
  // hand-built page) ----
  {
    // All four page-hero pages share the live __banner-wrap component;
    // not comparing raw backgroundImage url()s since hostnames differ.
    name: "Careers: page-hero photo layer (background-size/position)",
    livePath: "/careers",
    oursPath: "/careers.html",
    liveSelector: ".__banner-wrap",
    oursSelector: ".page-hero",
    props: ["backgroundSize", "backgroundPosition", "backgroundRepeat"],
  },
  {
    name: "Careers: Chart Your Path heading gradient",
    livePath: "/careers",
    oursPath: "/careers.html",
    liveMatchText: "Chart Your Path at IncubXperts",
    oursSelector: ".chart-path-title",
    props: ["fontSize", "webkitTextFillColor", "backgroundImage"],
  },
  {
    name: "Careers: Chart Your Path decorative background image (size/position)",
    livePath: "/careers",
    oursPath: "/careers.html",
    liveSelector: ".__chart-bg-image",
    oursSelector: ".chart-path-section",
    props: ["backgroundSize", "backgroundPosition", "backgroundRepeat"],
  },
  {
    // Was var(--color-primary)/var(--color-primary-dark) at 120deg, a
    // never-actually-verified "close enough" stand-in — real value is the
    // literal brand hex pair at 271.36deg.
    name: "Careers: benefits band gradient (exact hex, not the color vars)",
    livePath: "/careers",
    oursPath: "/careers.html",
    liveSelector: ".__main-benefits-wrap",
    oursSelector: ".benefits-band",
    props: ["backgroundImage"],
  },
  {
    name: "Contact: page-hero photo layer (background-size/position)",
    livePath: "/contact-us",
    oursPath: "/contact.html",
    liveSelector: ".__banner-wrap",
    oursSelector: ".page-hero",
    props: ["backgroundSize", "backgroundPosition", "backgroundRepeat"],
  },
  {
    name: "Contact: \"Got a Question?\" heading gradient (contact-subhead--lg)",
    livePath: "/contact-us",
    oursPath: "/contact.html",
    liveSelector: ".__main-title-right",
    oursSelector: ".contact-subhead--lg",
    props: ["webkitTextFillColor", "backgroundImage"],
  },
  {
    name: "Contact: GET DIRECTIONS link gradient",
    livePath: "/contact-us",
    oursPath: "/contact.html",
    liveSelector: ".__direction",
    oursSelector: ".office-directions",
    props: ["webkitTextFillColor", "backgroundImage"],
  },
  {
    name: "Contact: SUBMIT button gradient (not the flat btn-primary)",
    livePath: "/contact-us",
    oursPath: "/contact.html",
    liveSelector: ".__read-btn",
    oursSelector: ".btn-submit-gradient",
    props: ["backgroundImage"],
  },
  {
    // Decorative vector layered on the whole right-side card wrapper, not
    // a plain white card — checking layout props since the url() itself
    // never string-matches across hostnames.
    name: "Contact: form card background layer (position/repeat/color)",
    livePath: "/contact-us",
    oursPath: "/contact.html",
    liveSelector: ".__right",
    oursSelector: ".contact-form-card",
    props: ["backgroundPosition", "backgroundRepeat", "backgroundColor"],
  },
  {
    name: "Blog: VIEW MORE link gradient (was plain .btn-outline)",
    livePath: "/blog",
    oursPath: "/blog.html",
    liveSelector: ".explore-btn",
    oursSelector: ".blog-view-more span",
    props: ["webkitTextFillColor", "backgroundImage"],
  },
  {
    // Was var(--color-primary)/var(--color-primary-dark) at 120deg; real
    // value is the literal brand hex pair at 270deg.
    name: "Blog/Outlook: closing CTA band gradient (exact hex, not the color vars)",
    livePath: "/blog",
    oursPath: "/blog.html",
    liveSelector: ".__main-culture-wrap",
    oursSelector: ".cta-band--insights",
    props: ["backgroundImage"],
  },
  // Two decorative vector overlays on the closing CTA band — intentionally
  // NOT checked here as a computed-style scenario. Live paints both as one
  // element's two-layer background-image (backgroundRepeat computes to the
  // 2-item "no-repeat, no-repeat"); ours recreates the same visual with two
  // separate ::before/::after pseudo-elements (one layer each), so
  // backgroundRepeat can only ever compute to the 1-item "no-repeat" on our
  // side — a permanent, structural mismatch with no CSS fix, not a real bug.
  // Visual correctness (not just "some image exists") was verified directly
  // instead: each pseudo-element's width was set to match its source image's
  // exact natural dimensions (218x310 / 195x363, confirmed via
  // createImageBitmap against the live site's Vector.webp/Vector2.webp), so
  // the image isn't clipped by its own box. See css/style.css's
  // .cta-band--insights::before/::after rules for that fix.
  {
    name: "Outlook: page-hero photo layer (background-size/position)",
    livePath: "/outlook",
    oursPath: "/outlook.html",
    liveSelector: ".__banner-wrap",
    oursSelector: ".page-hero",
    props: ["backgroundSize", "backgroundPosition", "backgroundRepeat"],
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
        // client-side fetch that finishes just after network-idle. A
        // fixed wait here was flaky (a null "live" match a couple of runs
        // in a row, even at 3s) — poll instead: retry the actual matcher
        // up to 8 times over ~8s and stop as soon as it finds something,
        // rather than guessing one fixed delay for every scenario/page.
        for (let attempt = 0; attempt < 8; attempt++) {
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
          if (live) break;
          await new Promise((r) => setTimeout(r, 1000));
        }
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
