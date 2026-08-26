#!/usr/bin/env node
/**
 * build-case-studies.js
 *
 * Reads every Markdown+front-matter file in content/case-studies/, fills the
 * shared templates/template.html, and writes:
 *   - case-studies/<slug>.html   (one detail page per story)
 *   - case-studies.html          (the listing/index page)
 *
 * Also keeps sitemap.xml and llms.txt in sync with the current set of
 * case-study pages. See the plan doc for the full design rationale.
 *
 * Usage: node scripts/build-case-studies.js   (or: npm run build:case-studies)
 */

const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const ROOT = path.join(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content", "case-studies");
const TEMPLATE_PATH = path.join(ROOT, "templates", "template.html");
const OUTPUT_DIR = path.join(ROOT, "case-studies");
const INDEX_OUTPUT_PATH = path.join(ROOT, "case-studies.html");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const LLMS_PATH = path.join(ROOT, "llms.txt");
const SITE_URL = "https://www.incubxperts.com";

const STATIC_PAGES = [
  { loc: "/", priority: "1.0" },
  { loc: "/about.html", priority: "0.8" },
  { loc: "/services.html", priority: "0.8" },
  { loc: "/team.html", priority: "0.6" },
  { loc: "/blog.html", priority: "0.6" },
  { loc: "/careers.html", priority: "0.6" },
  { loc: "/contact.html", priority: "0.7" },
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Guard against JSON-LD content prematurely closing the <script> tag. */
function safeJsonLd(obj) {
  return JSON.stringify(obj, null, 2).replace(/<\/script/gi, "<\\/script");
}

/**
 * Hand-rolled front-matter parser. Deliberately NOT full YAML — supports:
 *   key: value          (scalar)
 * Everything else (comma-separated lists, numbered stat1/stat2/... pairs)
 * is handled by the caller via plain key lookups. No block scalars, no
 * nested structures — see the plan doc for why.
 *
 * IMPORTANT: do NOT wrap values in quotes ("like this") — this is not YAML,
 * quotes are not stripped and will end up literally in the output. A colon
 * inside a value (e.g. a title with a subtitle) is fine as-is: only the
 * FIRST colon on the line is treated as the key/value delimiter.
 */
function parseFrontMatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("Missing or malformed front matter (expected leading `---` ... `---` block).");
  }
  const [, frontMatterBlock, body] = match;
  const data = {};
  for (const line of frontMatterBlock.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    data[key] = value;
  }
  return { data, body: body.trim() };
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + "…";
}

// ---------------------------------------------------------------------------
// Load + validate every case-study content file
// ---------------------------------------------------------------------------

function loadCaseStudies() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.warn(`No content directory found at ${CONTENT_DIR} — nothing to build.`);
    return [];
  }

  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"));

  const stories = [];
  const seenSlugs = new Set();

  for (const file of files) {
    const fullPath = path.join(CONTENT_DIR, file);
    const raw = fs.readFileSync(fullPath, "utf8");
    const { data, body } = parseFrontMatter(raw);

    const required = ["slug", "title", "category", "client", "publishDate", "heroSummary"];
    const missing = required.filter((key) => !data[key]);
    if (missing.length) {
      throw new Error(`${file}: missing required front-matter field(s): ${missing.join(", ")}`);
    }

    if (seenSlugs.has(data.slug)) {
      throw new Error(`Duplicate slug "${data.slug}" found in ${file} — slugs must be unique.`);
    }
    seenSlugs.add(data.slug);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.publishDate)) {
      throw new Error(`${file}: publishDate "${data.publishDate}" must be in YYYY-MM-DD format.`);
    }

    // metaDescription: fall back to a truncated heroSummary, with a warning.
    if (!data.metaDescription) {
      data.metaDescription = truncate(data.heroSummary, 155);
      console.warn(
        `⚠ ${file}: no metaDescription given — falling back to a truncated heroSummary. Consider adding a hand-tuned one.`
      );
    }

    // Testimonial: all-or-nothing.
    const testimonialFields = ["testimonialQuote", "testimonialAuthor", "testimonialRole"];
    const testimonialGiven = testimonialFields.filter((k) => data[k]);
    if (testimonialGiven.length > 0 && testimonialGiven.length < testimonialFields.length) {
      throw new Error(
        `${file}: partial testimonial fields given (${testimonialGiven.join(", ")}) — all of ${testimonialFields.join(
          ", "
        )} are required together, or omit all three.`
      );
    }

    // Stats: numbered pairs stat1..stat4, stop at first missing number.
    const stats = [];
    for (let i = 1; i <= 4; i++) {
      const value = data[`stat${i}Value`];
      const label = data[`stat${i}Label`];
      if (!value || !label) break;
      stats.push({ value, label });
    }

    const tags = data.tags
      ? data.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    // Benefits: numbered title+description pairs benefit1..benefit6, stop at
    // first missing number. This is the "headline + full sentence" shape
    // used on the live site's "Benefits & Impacts" section — distinct from
    // the short number+label `stats` block above, which the two can coexist
    // alongside for pages that also want a single standout metric.
    const benefits = [];
    for (let i = 1; i <= 6; i++) {
      const title = data[`benefit${i}Title`];
      const description = data[`benefit${i}Description`];
      if (!title || !description) break;
      benefits.push({ title, description });
    }

    stories.push({
      slug: data.slug,
      title: data.title,
      category: data.category,
      client: data.client,
      publishDate: data.publishDate,
      heroSummary: data.heroSummary,
      metaDescription: data.metaDescription,
      ogImage: data.ogImage || null,
      tags,
      stats,
      benefits,
      testimonial:
        testimonialGiven.length === testimonialFields.length
          ? {
              quote: data.testimonialQuote,
              author: data.testimonialAuthor,
              role: data.testimonialRole,
            }
          : null,
      body,
      sourceFile: file,
    });
  }

  // Newest first.
  stories.sort((a, b) => (a.publishDate < b.publishDate ? 1 : -1));
  return stories;
}

// ---------------------------------------------------------------------------
// Render a story's Markdown body into the Challenge/Solution/Results shape
// ---------------------------------------------------------------------------

function renderBody(rawBody) {
  const headingRe = /^##\s+(.+)$/gm;
  const matches = [...rawBody.matchAll(headingRe)];

  if (matches.length === 0) {
    // No ## sections — flowing narrative fallback.
    return `
<section class="section">
  <div class="container">
    <div class="case-body">
      ${marked.parse(rawBody)}
    </div>
  </div>
</section>`;
  }

  const sections = [];
  for (let i = 0; i < matches.length; i++) {
    const heading = matches[i][1].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : rawBody.length;
    const sectionMarkdown = rawBody.slice(start, end).trim();
    sections.push({ heading, html: marked.parse(sectionMarkdown) });
  }

  const items = sections
    .map(
      (s) => `
    <div class="timeline-item">
      <h3>${escapeHtml(s.heading)}</h3>
      ${s.html}
    </div>`
    )
    .join("\n");

  return `
<section class="section">
  <div class="container">
    <div class="timeline">${items}
    </div>
  </div>
</section>`;
}

function renderTagsBlock(tags) {
  if (!tags.length) return "";
  const pills = tags.map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("\n      ");
  return `
<section class="section" style="padding-top:0;">
  <div class="container">
    <div class="pill-row">
      ${pills}
    </div>
  </div>
</section>`;
}

function renderBenefitsBlock(benefits) {
  if (!benefits.length) return "";
  const cards = benefits
    .map(
      (b) => `
      <div class="card">
        <h3>${escapeHtml(b.title)}</h3>
        <p>${escapeHtml(b.description)}</p>
      </div>`
    )
    .join("");
  return `
<section class="section section-alt">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Benefits &amp; Impacts</span>
    </div>
    <div class="grid grid-3">${cards}
    </div>
  </div>
</section>`;
}

function renderStatsBlock(stats) {
  if (!stats.length) return "";
  const items = stats
    .map(
      (s) => `
      <div class="stat"><div class="num">${escapeHtml(s.value)}</div><div class="label">${escapeHtml(
        s.label
      )}</div></div>`
    )
    .join("");
  return `
<section class="section section-alt">
  <div class="container">
    <div class="stats">${items}
    </div>
  </div>
</section>`;
}

function renderTestimonialBlock(testimonial) {
  if (!testimonial) return "";
  return `
<section class="section">
  <div class="container">
    <div class="testimonial-card" style="max-width:720px;margin:0 auto;">
      <p>&ldquo;${escapeHtml(testimonial.quote)}&rdquo;</p>
      <div class="testimonial-meta">${escapeHtml(testimonial.author)} <span>${escapeHtml(
        testimonial.role
      )}</span></div>
    </div>
  </div>
</section>`;
}

function renderOtherStoriesBlock(currentSlug, allStories, max = 3) {
  const others = allStories.filter((s) => s.slug !== currentSlug).slice(0, max);
  if (!others.length) return "";
  const cards = others
    .map(
      (s) => `
      <div class="card blog-card">
        <div class="date">${escapeHtml(s.category)}</div>
        <h3><a href="/case-studies/${s.slug}.html">${escapeHtml(s.title)}</a></h3>
        <p>${escapeHtml(s.heroSummary)}</p>
        <a href="/case-studies/${s.slug}.html">Read the Story &rarr;</a>
      </div>`
    )
    .join("");
  return `
<section class="section">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Other Case Stories</span>
      <h2>See Our Work in Action</h2>
    </div>
    <div class="grid grid-3">${cards}
    </div>
  </div>
</section>`;
}

function renderCtaBand() {
  return `
<section class="section section-alt">
  <div class="container">
    <div class="cta-band">
      <h2>Ready to write your own success story?</h2>
      <p>Let&rsquo;s talk about what purpose-built AI can do for your business.</p>
      <a href="/contact.html" class="btn btn-white">Book a Consultation</a>
    </div>
  </div>
</section>`;
}

// ---------------------------------------------------------------------------
// Build one detail page
// ---------------------------------------------------------------------------

function buildDetailPage(story, template, allStories) {
  const canonicalUrl = `${SITE_URL}/case-studies/${story.slug}.html`;
  const pageTitle = `${story.title} | IncubXperts Case Study`;

  const imageMetaBlock = story.ogImage
    ? `<meta property="og:image" content="${escapeHtml(story.ogImage)}" />\n<meta name="twitter:image" content="${escapeHtml(
        story.ogImage
      )}" />\n`
    : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: story.title,
    articleSection: story.category,
    datePublished: story.publishDate,
    description: story.metaDescription,
    mainEntityOfPage: canonicalUrl,
    author: { "@type": "Organization", name: "IncubXperts", url: SITE_URL },
    publisher: { "@type": "Organization", name: "IncubXperts", url: SITE_URL },
  };
  const jsonLdBlock = `<script type="application/ld+json">\n${safeJsonLd(jsonLd)}\n</script>\n`;

  const mainContent = [
    renderTagsBlock(story.tags),
    renderBody(story.body),
    renderBenefitsBlock(story.benefits),
    renderStatsBlock(story.stats),
    renderTestimonialBlock(story.testimonial),
    renderOtherStoriesBlock(story.slug, allStories),
    renderCtaBand(),
  ]
    .filter(Boolean)
    .join("\n");

  const replacements = {
    PAGE_TITLE: escapeHtml(pageTitle),
    META_DESCRIPTION: escapeHtml(story.metaDescription),
    CANONICAL_URL: canonicalUrl,
    OG_TYPE: "article",
    OG_TITLE: escapeHtml(pageTitle),
    OG_DESCRIPTION: escapeHtml(story.metaDescription),
    OG_URL: canonicalUrl,
    IMAGE_META_BLOCK: imageMetaBlock,
    TWITTER_TITLE: escapeHtml(pageTitle),
    TWITTER_DESCRIPTION: escapeHtml(story.metaDescription),
    JSONLD_BLOCK: jsonLdBlock,
    BREADCRUMB: escapeHtml(story.category),
    HERO_TITLE: escapeHtml(story.title),
    HERO_SUMMARY: escapeHtml(story.heroSummary),
    MAIN_CONTENT: mainContent,
  };

  return fillTemplate(template, replacements);
}

// ---------------------------------------------------------------------------
// Build the listing/index page
// ---------------------------------------------------------------------------

function buildIndexPage(stories, template) {
  const canonicalUrl = `${SITE_URL}/case-studies.html`;
  const pageTitle = "Case Stories | IncubXperts";
  const metaDescription =
    "Real client success stories from IncubXperts — AI adoption, agentic solutions, cloud transformation, and more.";

  const cards = stories
    .map(
      (s) => `
      <div class="card blog-card">
        <div class="date">${escapeHtml(s.category)}</div>
        <h3><a href="/case-studies/${s.slug}.html">${escapeHtml(s.title)}</a></h3>
        <p>${escapeHtml(s.heroSummary)}</p>
        <a href="/case-studies/${s.slug}.html">Read the Story &rarr;</a>
      </div>`
    )
    .join("\n");

  const mainContent = stories.length
    ? `
<section class="section">
  <div class="container">
    <div class="grid grid-3">${cards}
    </div>
  </div>
</section>
${renderCtaBand()}`
    : `
<section class="section">
  <div class="container">
    <p class="text-center">More success stories are on the way &mdash; check back soon.</p>
  </div>
</section>
${renderCtaBand()}`;

  const replacements = {
    PAGE_TITLE: escapeHtml(pageTitle),
    META_DESCRIPTION: escapeHtml(metaDescription),
    CANONICAL_URL: canonicalUrl,
    OG_TYPE: "website",
    OG_TITLE: escapeHtml(pageTitle),
    OG_DESCRIPTION: escapeHtml(metaDescription),
    OG_URL: canonicalUrl,
    IMAGE_META_BLOCK: "",
    TWITTER_TITLE: escapeHtml(pageTitle),
    TWITTER_DESCRIPTION: escapeHtml(metaDescription),
    JSONLD_BLOCK: "",
    BREADCRUMB: "Case Stories",
    HERO_TITLE: "Success Delivered, Trust Earned",
    HERO_SUMMARY: "Real outcomes from real client partnerships across AI adoption, agentic solutions, and cloud transformation.",
    MAIN_CONTENT: mainContent,
  };

  return fillTemplate(template, replacements);
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
// sitemap.xml — fully regenerated from static pages + case studies
// ---------------------------------------------------------------------------

function buildSitemap(stories) {
  const urls = [
    ...STATIC_PAGES.map((p) => `  <url>\n    <loc>${SITE_URL}${p.loc}</loc>\n    <priority>${p.priority}</priority>\n  </url>`),
    `  <url>\n    <loc>${SITE_URL}/case-studies.html</loc>\n    <priority>0.7</priority>\n  </url>`,
    ...stories.map(
      (s) =>
        `  <url>\n    <loc>${SITE_URL}/case-studies/${s.slug}.html</loc>\n    <priority>0.6</priority>\n    <lastmod>${s.publishDate}</lastmod>\n  </url>`
    ),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
    "\n"
  )}\n</urlset>\n`;
}

// ---------------------------------------------------------------------------
// llms.txt — sentinel-delimited block insertion/replacement
// ---------------------------------------------------------------------------

const LLMS_START = "<!-- CASE-STUDIES:START -->";
const LLMS_END = "<!-- CASE-STUDIES:END -->";

function buildLlmsBlock(stories) {
  // Skip anything from an _EXAMPLE-prefixed source file so placeholder
  // content never leaks into the public-facing llms.txt.
  const real = stories.filter((s) => !s.sourceFile.startsWith("_EXAMPLE"));
  if (!real.length) {
    return `${LLMS_START}\n${LLMS_END}`;
  }
  const lines = real.map((s) => `- [${s.title}](/case-studies/${s.slug}.html): ${s.heroSummary}`);
  return `${LLMS_START}\n## Case Stories\n\n${lines.join("\n")}\n${LLMS_END}`;
}

function updateLlmsTxt(stories) {
  if (!fs.existsSync(LLMS_PATH)) {
    console.warn(`No llms.txt found at ${LLMS_PATH} — skipping.`);
    return;
  }
  const current = fs.readFileSync(LLMS_PATH, "utf8");
  const block = buildLlmsBlock(stories);

  let updated;
  if (current.includes(LLMS_START) && current.includes(LLMS_END)) {
    const re = new RegExp(`${LLMS_START}[\\s\\S]*?${LLMS_END}`);
    updated = current.replace(re, block);
  } else {
    // First run: insert right before the "## Pages" heading, if present;
    // otherwise append at the end.
    if (current.includes("## Pages")) {
      updated = current.replace("## Pages", `${block}\n\n## Pages`);
    } else {
      updated = `${current.trimEnd()}\n\n${block}\n`;
    }
  }

  fs.writeFileSync(LLMS_PATH, updated, "utf8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const stories = loadCaseStudies();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const story of stories) {
    const html = buildDetailPage(story, template, stories);
    const outPath = path.join(OUTPUT_DIR, `${story.slug}.html`);
    fs.writeFileSync(outPath, html, "utf8");
    console.log(`✓ wrote case-studies/${story.slug}.html`);
  }

  const indexHtml = buildIndexPage(stories, template);
  fs.writeFileSync(INDEX_OUTPUT_PATH, indexHtml, "utf8");
  console.log(`✓ wrote case-studies.html (${stories.length} stor${stories.length === 1 ? "y" : "ies"})`);

  fs.writeFileSync(SITEMAP_PATH, buildSitemap(stories), "utf8");
  console.log("✓ updated sitemap.xml");

  updateLlmsTxt(stories);
  console.log("✓ updated llms.txt");

  console.log("\nDone.");
}

main();
