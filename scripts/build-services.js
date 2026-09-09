#!/usr/bin/env node
/**
 * build-services.js
 *
 * Builds services/<slug>.html — one page per real service on
 * incubxperts.com/services/<slug> — from scripts/data/services.js, through
 * the same templates/template.html used by build-case-studies.js.
 *
 * Unlike case studies, service content isn't in Strapi: it's hand-authored
 * in scripts/data/services.js, each entry copied from the live page (see
 * that file's header comment for the schema and SITE-AUDIT.md for context
 * on why this exists as individual pages rather than one combined page).
 * Only entries present there get built.
 *
 * Usage: node scripts/build-services.js   (or: npm run build:services)
 */

const fs = require("fs");
const path = require("path");
const services = require("./data/services.js");

const ROOT = path.join(__dirname, "..");
const TEMPLATE_PATH = path.join(ROOT, "templates", "template.html");
const PARTIALS_DIR = path.join(ROOT, "templates", "partials");
const OUTPUT_DIR = path.join(ROOT, "services");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const SITE_URL = "https://www.incubxperts.com";

function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fillTemplate(template, replacements) {
  let html = template;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`{{${key}}}`).join(value);
  }
  const leftover = html.match(/\{\{[A-Z_]+\}\}/);
  if (leftover) {
    throw new Error(`Template placeholder ${leftover[0]} was never filled — check the replacements map.`);
  }
  return html;
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

/** Hero: same page-hero component used by about.html/careers.html/etc.,
 * with its own background photo and a 3-level breadcrumb (Home / Services /
 * <service name>) — "Services" links to services.html, our own hub page
 * (the live site oddly links this breadcrumb segment to "/" — services.html
 * is the more useful destination for a visitor here). */
function renderHero(service) {
  return `
<section class="page-hero" style="background-image:url('${escapeHtml(service.heroImage)}');">
  <div class="container">
    <nav class="page-breadcrumb" aria-label="breadcrumb">
      <a href="/index.html" class="breadcrumb-home"><img src="/images/icons/home.svg" alt="Home" width="20" height="20" /></a>
      <img src="/images/icons/separator.svg" alt="" class="breadcrumb-sep" width="16" height="16" />
      <a href="/services.html">Services</a>
      <img src="/images/icons/separator.svg" alt="" class="breadcrumb-sep" width="16" height="16" />
      <span>${escapeHtml(service.name)}</span>
    </nav>
    <h1>${escapeHtml(service.name)}</h1>
    <p class="service-hero-tagline">${escapeHtml(service.tagline)}</p>
    <a href="${escapeHtml(service.heroCta.href)}" class="btn btn-primary mt-40">${escapeHtml(service.heroCta.text)}</a>
  </div>
</section>`;
}

function renderWhyMatters(service) {
  const paras = service.whyMatters.paragraphs.map((p) => `<p>${p}</p>`).join("\n");
  return `
<section class="section service-tint">
  <div class="container" style="max-width:820px;">
    <h2 class="service-statement">${escapeHtml(service.whyMatters.title)}</h2>
    ${paras}
  </div>
</section>`;
}

function renderOurServices(service) {
  const cards = service.ourServices.items
    .map(
      (item) => `
      <div class="service-card">
        <img src="${escapeHtml(item.icon)}" alt="" width="48" height="48" />
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description)}</p>
      </div>`
    )
    .join("");
  return `
<section class="section service-tint">
  <div class="container">
    <h2 class="service-statement service-statement--upper">Our Services</h2>
    <p class="service-statement-sub">${escapeHtml(service.ourServices.intro)}</p>
    <div class="grid grid-3 service-card-grid">${cards}
    </div>
  </div>
</section>`;
}

/** Process steps: real icons, a straight (not the live site's zigzag) row
 * connected by the same gradient-line-and-dot connector already built for
 * about.html's history timeline — a deliberate layout simplification (the
 * live site's version has a duplicated/hidden DOM node per step that made
 * an exact clone impractical to verify), keeping the real icons/copy. */
function renderProcess(service) {
  const steps = service.process.steps
    .map(
      (step) => `
      <div class="process-step">
        <img src="${escapeHtml(step.icon)}" alt="" width="64" height="64" />
        <h3>${escapeHtml(step.title)}</h3>
        <p>${escapeHtml(step.description)}</p>
      </div>`
    )
    .join("");
  const intro = service.process.intro
    ? `<p class="service-statement-sub" style="text-align:center;">${escapeHtml(service.process.intro)}</p>`
    : "";
  return `
<section class="section">
  <div class="container">
    <h2 class="service-statement" style="text-align:center;">Our Process</h2>
    ${intro}
    <div class="process-row">${steps}
    </div>
  </div>
</section>`;
}

/** Reuses the exact .cs-card component from case-studies (same visual card:
 * image, title, "READ MORE" + arrow) so these 3 cards match the real
 * case-studies listing exactly rather than introducing a new card style. */
function renderFeaturedCaseStories(service) {
  const CARD_ARROW_SVG = `<svg class="cs-read-more-arrow" viewBox="0 0 16 16" width="15" height="16" fill="none" aria-hidden="true"><path d="M3 8H13M13 8L8.5 3.5M13 8L8.5 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const cards = service.featuredCaseStories
    .map(
      (s) => `
      <a class="cs-card" href="/case-studies/${escapeHtml(s.slug)}.html">
        <img src="${escapeHtml(s.image)}" alt="${escapeHtml(s.title)}" />
        <div class="cs-card-body">
          <h3>${escapeHtml(s.title)}</h3>
          <span class="cs-read-more">READ MORE${CARD_ARROW_SVG}</span>
        </div>
      </a>`
    )
    .join("");
  return `
<section class="section">
  <div class="container">
    <div class="service-section-head">
      <h2 class="section-title">Featured Case Stories</h2>
      <a href="/case-studies.html" class="service-explore-link">Explore &rsaquo;</a>
    </div>
    <div class="cs-card-grid">${cards}
    </div>
  </div>
</section>`;
}

/** The live site's version is an interactive hover-reveal component: one
 * card is "active" at a time, showing its photo + white text, while the
 * others sit as plain light cards with dark text — confirmed via computed
 * style (desktop default state is dark-on-light, only the active slide is
 * white-on-photo). Simplified here to all 3 cards permanently showing
 * their photo + a dark overlay + white text, since that's legible without
 * needing hover-state JS — a deliberate behavior simplification, not a
 * content gap (same real photos/titles/descriptions either way). */
function renderRelatedServices(service) {
  const cards = service.relatedServices
    .map((r) => {
      const href = r.slug ? `/services/${escapeHtml(r.slug)}.html` : "/services.html";
      return `
      <a class="service-related-card" href="${href}" style="background-image:url('${escapeHtml(r.image)}');">
        <div class="service-related-overlay">
          <h3>${escapeHtml(r.name)}</h3>
          <p>${escapeHtml(r.description)} <img src="/images/services/related-arrow-hover.svg" alt="" width="20" height="20" /></p>
        </div>
      </a>`;
    })
    .join("");
  return `
<section class="section service-tint">
  <div class="container">
    <h2 class="service-statement service-statement--sm">Explore More of What We Do</h2>
    <div class="grid grid-3 service-related-grid">${cards}
    </div>
  </div>
</section>`;
}

function renderClosingCta(service) {
  return `
<section class="section">
  <div class="container">
    <div class="cta-band">
      <h2>${escapeHtml(service.closingCta.title)}</h2>
      <a href="${escapeHtml(service.closingCta.href)}" class="btn btn-white mt-40">${escapeHtml(service.closingCta.buttonText)}</a>
    </div>
  </div>
</section>`;
}

// ---------------------------------------------------------------------------
// Build one page
// ---------------------------------------------------------------------------

function buildServicePage(service, template, partials) {
  const canonicalUrl = `${SITE_URL}/services/${service.slug}.html`;
  const pageTitle = `${service.name} | IncubXperts`;

  const mainContent = [
    renderWhyMatters(service),
    renderOurServices(service),
    renderProcess(service),
    renderFeaturedCaseStories(service),
    renderRelatedServices(service),
    renderClosingCta(service),
  ].join("\n");

  const replacements = {
    PAGE_TITLE: escapeHtml(pageTitle),
    META_DESCRIPTION: escapeHtml(service.metaDescription),
    CANONICAL_URL: canonicalUrl,
    OG_TYPE: "website",
    OG_TITLE: escapeHtml(pageTitle),
    OG_DESCRIPTION: escapeHtml(service.metaDescription),
    OG_URL: canonicalUrl,
    IMAGE_META_BLOCK: "",
    TWITTER_TITLE: escapeHtml(pageTitle),
    TWITTER_DESCRIPTION: escapeHtml(service.metaDescription),
    JSONLD_BLOCK: "",
    HEADER: partials.header,
    FOOTER: partials.footer,
    HERO_SECTION: renderHero(service),
    MAIN_CONTENT: mainContent,
  };

  return fillTemplate(template, replacements);
}

// ---------------------------------------------------------------------------
// sitemap.xml — sentinel-delimited block, same convention as llms.txt's
// CASE-STUDIES block in build-case-studies.js. build-case-studies.js runs
// before this script (see package.json) and fully rewrites sitemap.xml
// from its own static-page + case-study list, which would otherwise drop
// these URLs — so this inserts/replaces its own block afterward rather
// than needing build-case-studies.js to know about services.js.
// ---------------------------------------------------------------------------

const SITEMAP_START = "<!-- SERVICES:START -->";
const SITEMAP_END = "<!-- SERVICES:END -->";

function buildSitemapBlock() {
  const urls = services.map(
    (s) => `  <url>\n    <loc>${SITE_URL}/services/${s.slug}.html</loc>\n    <priority>0.7</priority>\n  </url>`
  );
  return `${SITEMAP_START}\n${urls.join("\n")}\n${SITEMAP_END}`;
}

function updateSitemap() {
  if (!fs.existsSync(SITEMAP_PATH)) {
    console.warn(`No sitemap.xml found at ${SITEMAP_PATH} — skipping.`);
    return;
  }
  const current = fs.readFileSync(SITEMAP_PATH, "utf8");
  const block = buildSitemapBlock();

  let updated;
  if (current.includes(SITEMAP_START) && current.includes(SITEMAP_END)) {
    const re = new RegExp(`${SITEMAP_START}[\\s\\S]*?${SITEMAP_END}`);
    updated = current.replace(re, block);
  } else {
    // First run: insert just before </urlset>.
    updated = current.replace("</urlset>", `${block}\n</urlset>`);
  }
  fs.writeFileSync(SITEMAP_PATH, updated, "utf8");
  console.log("✓ updated sitemap.xml (services block)");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const partials = {
    header: fs.readFileSync(path.join(PARTIALS_DIR, "header.html"), "utf8").trim(),
    footer: fs.readFileSync(path.join(PARTIALS_DIR, "footer.html"), "utf8").trim(),
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const currentSlugs = new Set(services.map((s) => s.slug));

  for (const service of services) {
    const html = buildServicePage(service, template, partials);
    const outPath = path.join(OUTPUT_DIR, `${service.slug}.html`);
    fs.writeFileSync(outPath, html, "utf8");
    console.log(`✓ wrote services/${service.slug}.html`);
  }

  // Keep services/ in sync with services.js — a removed entry shouldn't
  // leave a stale page behind (same convention as build-case-studies.js).
  if (fs.existsSync(OUTPUT_DIR)) {
    for (const file of fs.readdirSync(OUTPUT_DIR)) {
      if (!file.endsWith(".html")) continue;
      const slug = file.slice(0, -".html".length);
      if (!currentSlugs.has(slug)) {
        fs.unlinkSync(path.join(OUTPUT_DIR, file));
        console.log(`✗ removed stale services/${file} (no matching entry in services.js)`);
      }
    }
  }

  updateSitemap();

  console.log("\nDone.");
}

main();
