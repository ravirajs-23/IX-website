/**
 * case-studies-core.js
 *
 * Pure rendering: turns already-resolved `story` objects (the exact shape
 * data/case-studies-manifest.json freezes per slug — see mapStrapiEntryToStory
 * in case-studies-strapi-source.js for where that shape comes from) into the
 * site's actual HTML/XML/text output. Zero network access, zero knowledge of
 * Strapi. Used by scripts/build-case-studies.js (the site build) and by
 * scripts/publish-case-studies.js (to render just-approved stories).
 */
const SITE_URL = "https://www.incubxperts.com";

const STATIC_PAGES = [
  { loc: "/", priority: "1.0" },
  { loc: "/about.html", priority: "0.8" },
  { loc: "/services.html", priority: "0.8" },
  { loc: "/blog.html", priority: "0.6" },
  { loc: "/outlook.html", priority: "0.6" },
  { loc: "/careers.html", priority: "0.6" },
  { loc: "/contact.html", priority: "0.7" },
  { loc: "/partnerships.html", priority: "0.5" },
  { loc: "/ploko-ai.html", priority: "0.4" },
];

const DEFAULT_BENEFIT_ICON = "/images/case-studies/_benefit-icon-default.svg";
const LLMS_START = "<!-- CASE-STUDIES:START -->";
const LLMS_END = "<!-- CASE-STUDIES:END -->";

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

/** OG/Twitter image tags need a fully-qualified URL — prefix root-relative paths. */
function toAbsoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  return pathOrUrl.startsWith("http") ? pathOrUrl : `${SITE_URL}${pathOrUrl}`;
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + "…";
}

/** Visible disclaimer for underscore-prefixed test/demo content — never for real stories. */
function renderDemoNoticeBlock() {
  return `
<section class="section" style="padding-bottom:0;">
  <div class="container">
    <div class="testimonial-card" style="border-color:#e0a800;background:#fff8e6;">
      <p style="color:#7a5b00;font-style:normal;"><strong>Demo content</strong> &mdash; this case study is a fictional example used to test the page template. No real client, engagement, or figures are represented.</p>
    </div>
  </div>
</section>`;
}

/** Detail-page hero: story image as background (or flat gray fallback), breadcrumb, title, tag chips. */
function renderDetailHeroSection(story) {
  const bgStyle = story.heroImage ? ` style="background-image:url('${escapeHtml(story.heroImage)}');"` : "";
  const chips = story.tags.length
    ? `<div class="cs-chip-row">${story.tags.map((t) => `<span class="cs-chip">${escapeHtml(t)}</span>`).join("")}</div>`
    : "";
  return `
<section class="cs-hero"${bgStyle}>
  <div class="cs-hero-inner">
    <div class="cs-breadcrumb">
      <a href="/index.html">Home</a><span class="sep">&rsaquo;</span>
      <a href="/case-studies.html">Case Stories</a><span class="sep">&rsaquo;</span>
      <span>Case Story Detail</span>
    </div>
    <h1>${escapeHtml(story.title)}</h1>
    ${chips}
  </div>
</section>`;
}

/** Listing-page hero: fixed background image, title, subtitle — no per-story data. */
function renderListingHeroSection() {
  return `
<section class="cs-hero" style="background-image:url('/images/case-studies/_listing-hero-bg.webp');">
  <div class="cs-hero-inner">
    <div class="cs-breadcrumb">
      <a href="/index.html">Home</a><span class="sep">&rsaquo;</span>
      <span>Case Stories</span>
    </div>
    <h1>Case Stories</h1>
    <p class="cs-hero-sub">See our work in action</p>
  </div>
</section>`;
}

/**
 * Inline banner shown above "Business Problem" — distinct from the hero
 * background (heroImage). Matches the live site: full-width, no radius,
 * no shadow. Unlike the live site (object-fit: fill, which can distort an
 * arbitrary future upload), this uses height:auto to always preserve the
 * image's real aspect ratio.
 */
function renderDetailImageBlock(detailImage, title) {
  if (!detailImage) return "";
  const media = detailImage.isVideo
    ? `<video src="${escapeHtml(detailImage.url)}" controls></video>`
    : `<img src="${escapeHtml(detailImage.url)}" alt="${escapeHtml(title)}" />`;
  return `
<section class="section" style="padding-bottom:0;">
  <div class="container">
    <div class="cs-detail-image">${media}</div>
  </div>
</section>`;
}

function renderBenefitsBlock(benefits) {
  if (!benefits.length) return "";
  const cards = benefits
    .map((b) => {
      const iconSrc = b.icon || DEFAULT_BENEFIT_ICON;
      return `
      <div class="cs-benefit">
        <img class="icon" src="${escapeHtml(iconSrc)}" alt="" />
        <h3>${escapeHtml(b.title)}</h3>
        <p>${escapeHtml(b.description)}</p>
      </div>`;
    })
    .join("");
  return `
<section class="section">
  <div class="container">
    <h3 class="cs-heading">Benefits &amp; Impacts</h3>
    <div class="cs-benefit-grid">${cards}
    </div>
  </div>
</section>`;
}

/**
 * The full-width "TRUSTIMONIALS" carousel — identical on every case-study
 * page (see fetchAllTestimonials() in case-studies-strapi-source.js for
 * why). Markup renders just the first testimonial (so the page is
 * meaningful with JS disabled and has real content for crawlers/SEO);
 * js/script.js's testimonials-carousel controller hydrates it into an
 * auto-advancing carousel over the full list, which travels with the page
 * as a JSON blob.
 */
function renderTestimonialsCarousel(testimonials) {
  if (!testimonials.length) return "";
  const first = testimonials[0];
  return `
<section class="testimonials-section" data-testimonials>
  <div class="container">
    <div class="testimonials-heading">
      <div class="testimonials-eyebrow">TRUSTIMONIALS</div>
      <p class="testimonials-title">Success Delivered, Trust Earned</p>
    </div>
    <div class="testimonial-card">
      <div class="quote-mark">&ldquo;</div>
      <p data-t="quote">${escapeHtml(first.quote)}</p>
      <hr />
      <h2 data-t="name">${escapeHtml(first.author)}</h2>
      <h3 data-t="role">${escapeHtml(first.role)}</h3>
      <h4 data-t="company">${escapeHtml(first.company)}</h4>
    </div>
    <div class="testimonials-progress"><div class="testimonials-progress-bar" data-t="progress"></div></div>
    <div class="testimonials-nav">
      <button type="button" data-t-prev aria-label="Previous testimonial">&lsaquo;</button>
      <button type="button" data-t-next aria-label="Next testimonial">&rsaquo;</button>
    </div>
  </div>
</section>
<script>window.__TESTIMONIALS__ = ${safeJsonLd(testimonials)};</script>`;
}

/** A right-pointing arrow next to "READ MORE" — matches the live site's card
 * (an actual gradient-filled icon there; simplified here to a solid-color
 * inline SVG using currentColor, so it's trivial to recolor via CSS). */
const CARD_ARROW_SVG = `<svg class="cs-read-more-arrow" viewBox="0 0 16 16" width="15" height="16" fill="none" aria-hidden="true"><path d="M3 8H13M13 8L8.5 3.5M13 8L8.5 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * Shared card, used by the listing grid and "Other Case Stories". Matches
 * the live site's actual card exactly (verified via its DOM): image, title,
 * "READ MORE" + arrow — no category tag or description text on the card
 * itself, even though `category` is tracked via `data-category` for the
 * listing page's filter pills/search (see js/script.js), just not shown.
 */
function renderStoryCard(s) {
  const media = s.heroImage
    ? `<img src="${escapeHtml(s.heroImage)}" alt="${escapeHtml(s.title)}" />`
    : `<div class="cs-card-noimg"></div>`;
  return `
      <a class="cs-card" href="/case-studies/${s.slug}.html" data-category="${escapeHtml(s.category)}" data-title="${escapeHtml(s.title)}">
        ${media}
        <div class="cs-card-body">
          <h3>${escapeHtml(s.title)}</h3>
          <span class="cs-read-more">READ MORE${CARD_ARROW_SVG}</span>
        </div>
      </a>`;
}

function renderOtherStoriesBlock(currentSlug, allStories, max = 3) {
  const others = allStories.filter((s) => s.slug !== currentSlug).slice(0, max);
  if (!others.length) return "";
  const cards = others.map(renderStoryCard).join("");
  return `
<section class="section">
  <div class="container">
    <div class="cs-section-label">Other Case Stories</div>
    <div class="cs-card-grid">${cards}
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

function buildDetailPage(story, template, allStories, partials, testimonials) {
  const canonicalUrl = `${SITE_URL}/case-studies/${story.slug}.html`;
  const pageTitle = `${story.title} | IncubXperts Case Study`;

  const absoluteOgImage = toAbsoluteUrl(story.ogImage);
  const imageMetaBlock = absoluteOgImage
    ? `<meta property="og:image" content="${escapeHtml(absoluteOgImage)}" />\n<meta name="twitter:image" content="${escapeHtml(
        absoluteOgImage
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

  const isDemo = story.sourceFile.startsWith("_");
  const mainContent = [
    isDemo ? renderDemoNoticeBlock() : "",
    renderDetailImageBlock(story.detailImage, story.title),
    story.bodyHtml || "",
    renderBenefitsBlock(story.benefits),
    renderTestimonialsCarousel(testimonials),
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
    HEADER: partials.header,
    FOOTER: partials.footer,
    HERO_SECTION: renderDetailHeroSection(story),
    MAIN_CONTENT: mainContent,
  };

  return fillTemplate(template, replacements);
}

function buildIndexPage(stories, template, partials) {
  const canonicalUrl = `${SITE_URL}/case-studies.html`;
  const pageTitle = "Case Stories | IncubXperts";
  const metaDescription =
    "Real client success stories from IncubXperts — AI adoption, agentic solutions, cloud transformation, and more.";

  const categories = [...new Set(stories.map((s) => s.category))].sort();
  const pills = [
    `<button class="cs-filter-pill active" data-filter="All">All</button>`,
    ...categories.map((c) => `<button class="cs-filter-pill" data-filter="${escapeHtml(c)}">${escapeHtml(c)}</button>`),
  ].join("");

  const cards = stories.map(renderStoryCard).join("\n");

  const mainContent = stories.length
    ? `
<section class="section">
  <div class="container">
    <div class="cs-filter-bar">
      <div class="cs-filter-pills">${pills}
      </div>
      <input class="cs-search" type="search" placeholder="Search" aria-label="Search case stories" />
    </div>
    <div class="cs-section-label">Case Stories</div>
    <div class="cs-card-grid">${cards}
    </div>
    <div class="cs-view-more-wrap"><button class="cs-view-more" hidden>VIEW MORE</button></div>
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
    HEADER: partials.header,
    FOOTER: partials.footer,
    HERO_SECTION: renderListingHeroSection(),
    MAIN_CONTENT: mainContent,
  };

  return fillTemplate(template, replacements);
}

function buildSitemap(stories) {
  // Underscore-prefixed test/example content shouldn't be indexed.
  const indexable = stories.filter((s) => !s.sourceFile.startsWith("_"));
  const urls = [
    ...STATIC_PAGES.map((p) => `  <url>\n    <loc>${SITE_URL}${p.loc}</loc>\n    <priority>${p.priority}</priority>\n  </url>`),
    `  <url>\n    <loc>${SITE_URL}/case-studies.html</loc>\n    <priority>0.7</priority>\n  </url>`,
    ...indexable.map(
      (s) =>
        `  <url>\n    <loc>${SITE_URL}/case-studies/${s.slug}.html</loc>\n    <priority>0.6</priority>\n    <lastmod>${s.publishDate}</lastmod>\n  </url>`
    ),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
    "\n"
  )}\n</urlset>\n`;
}

function buildLlmsBlock(stories) {
  // Skip anything from an underscore-prefixed source file (the convention
  // for _EXAMPLE/_TEST/etc. non-real content) so it never leaks into the
  // public-facing llms.txt.
  const real = stories.filter((s) => !s.sourceFile.startsWith("_"));
  if (!real.length) {
    return `${LLMS_START}\n${LLMS_END}`;
  }
  const lines = real.map((s) => `- [${s.title}](/case-studies/${s.slug}.html): ${s.heroSummary}`);
  return `${LLMS_START}\n## Case Stories\n\n${lines.join("\n")}\n${LLMS_END}`;
}

function updateLlmsTxt(stories, llmsPath, fs) {
  if (!fs.existsSync(llmsPath)) {
    console.warn(`No llms.txt found at ${llmsPath} — skipping.`);
    return;
  }
  const current = fs.readFileSync(llmsPath, "utf8");
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

  fs.writeFileSync(llmsPath, updated, "utf8");
}

module.exports = {
  SITE_URL,
  STATIC_PAGES,
  DEFAULT_BENEFIT_ICON,
  escapeHtml,
  safeJsonLd,
  toAbsoluteUrl,
  truncate,
  renderDemoNoticeBlock,
  renderDetailHeroSection,
  renderListingHeroSection,
  renderDetailImageBlock,
  renderBenefitsBlock,
  renderTestimonialsCarousel,
  renderStoryCard,
  renderOtherStoriesBlock,
  renderCtaBand,
  fillTemplate,
  buildDetailPage,
  buildIndexPage,
  buildSitemap,
  buildLlmsBlock,
  updateLlmsTxt,
};
