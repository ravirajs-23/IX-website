#!/usr/bin/env node
/**
 * build-case-studies.js
 *
 * Case studies can come from TWO sources, merged together:
 *   1. Markdown+front-matter files in content/case-studies/
 *   2. A Strapi CMS instance (read-only), via its REST API
 *
 * Both are normalized into the same internal "story" shape and rendered
 * through the same templates/template.html, producing:
 *   - case-studies/<slug>.html   (one detail page per story)
 *   - case-studies.html          (the listing/index page)
 *
 * Also keeps sitemap.xml and llms.txt in sync with the current set of
 * case-study pages. See the plan doc for the full design rationale.
 *
 * Strapi env vars (optional — set in .env, see .env.example):
 *   STRAPI_URL         e.g. http://localhost:1337
 *   STRAPI_API_TOKEN   a Strapi API token (read access is enough)
 * If unset, the Strapi source is silently skipped — the script still works
 * purely off local .md files.
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

/** Minimal .env loader — no dependency. Real env vars (e.g. from Vercel) always win. */
function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

const STRAPI_URL = process.env.STRAPI_URL || "";
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || "";

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

/** OG/Twitter image tags need a fully-qualified URL — prefix root-relative paths. */
function toAbsoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  return pathOrUrl.startsWith("http") ? pathOrUrl : `${SITE_URL}${pathOrUrl}`;
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + "…";
}

/** Resolve a Strapi media field (single media) to a usable URL, or null. */
function resolveMediaUrl(media) {
  if (!media) return null;
  // Strapi v5 returns media fields as a plain object with `.url`; be
  // defensive about the v4-style `{ data: { attributes: { url } } }` shape
  // too, in case of an older/differently-configured instance.
  const url = media.url || media?.data?.attributes?.url || null;
  if (!url) return null;
  return url.startsWith("http") ? url : `${STRAPI_URL}${url}`;
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
      heroImage: data.heroImage || null,
      // ogImage falls back to heroImage when not explicitly given, so a
      // story only needs one image field in the common case.
      ogImage: data.ogImage || data.heroImage || null,
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
      bodyHtml: renderMarkdownBody(body),
      sourceFile: file,
    });
  }

  // Newest first.
  stories.sort((a, b) => (a.publishDate < b.publishDate ? 1 : -1));
  return stories;
}

// ---------------------------------------------------------------------------
// Load case studies from Strapi (optional second content source)
// ---------------------------------------------------------------------------

/** Map one Strapi case-story API entry into the same internal story shape. */
function mapStrapiEntryToStory(entry) {
  const industry =
    entry.master_industry_types?.[0]?.IndustryName ||
    entry.master_industries_types?.[0]?.IndustryName ||
    "General";

  const heroImage = resolveMediaUrl(entry.BGImage);
  const ogImage = resolveMediaUrl(entry.OGimage) || heroImage;

  const heroSummary = entry.OGdescription || entry.SEOdescription || entry.Title;
  const metaDescription = entry.SEOdescription || entry.OGdescription || truncate(heroSummary, 155);

  const benefits = (entry.case_benefits_and_impacts || []).map((b) => ({
    title: b.Title,
    description: b.ShortDescription,
    icon: resolveMediaUrl(b.IconImage),
  }));

  const firstTestimonial = (entry.testimonials || [])[0];
  const testimonial = firstTestimonial
    ? {
        quote: firstTestimonial.Testimonial,
        author: firstTestimonial.TestimonyName,
        role: [firstTestimonial.Designation, firstTestimonial.Company].filter(Boolean).join(", "),
      }
    : null;

  let bodyHtml = "";
  if (entry.CaseDetailsMarkdown && entry.CaseDetailsMarkdown.trim()) {
    bodyHtml = renderMarkdownBody(entry.CaseDetailsMarkdown);
  } else if (Array.isArray(entry.CaseDetails) && entry.CaseDetails.length) {
    bodyHtml = renderStrapiBlocksBody(entry.CaseDetails);
  } else {
    console.warn(`⚠ Strapi entry "${entry.Title}" (slug: ${entry.slug}) has no CaseDetails content.`);
  }

  return {
    slug: entry.slug,
    title: entry.Title,
    category: industry,
    // Strapi's case-story schema has no dedicated "client" field (and the
    // current template doesn't render one), so this is left empty here.
    client: "",
    publishDate: (entry.publishedAt || entry.createdAt || "").slice(0, 10),
    heroSummary,
    metaDescription,
    heroImage,
    ogImage,
    tags: (entry.TagsCommaSeparated || "").split(",").map((t) => t.trim()).filter(Boolean),
    // No dedicated numeric-stat equivalent in the Strapi schema today.
    stats: [],
    benefits,
    testimonial,
    bodyHtml,
    sourceFile: `strapi:${entry.slug}`,
  };
}

async function fetchStrapiCaseStudies() {
  if (!STRAPI_URL || !STRAPI_API_TOKEN) {
    console.log("ℹ STRAPI_URL/STRAPI_API_TOKEN not set — skipping the Strapi content source.");
    return [];
  }

  const params = new URLSearchParams();
  params.set("populate[case_benefits_and_impacts][populate]", "IconImage");
  params.set("populate[testimonials]", "true");
  params.set("populate[BGImage]", "true");
  params.set("populate[OGimage]", "true");
  params.set("populate[master_industry_types]", "true");
  params.set("populate[master_industries_types]", "true");
  params.set("pagination[pageSize]", "100");

  const res = await fetch(`${STRAPI_URL}/api/case-stories?${params.toString()}`, {
    headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Strapi API request failed: ${res.status} ${res.statusText} (${STRAPI_URL}/api/case-stories)`);
  }
  const json = await res.json();
  const entries = json.data || [];
  console.log(`✓ fetched ${entries.length} case-stor${entries.length === 1 ? "y" : "ies"} from Strapi (${STRAPI_URL})`);
  return entries.map(mapStrapiEntryToStory);
}

// ---------------------------------------------------------------------------
// Body rendering — shared by both content sources (Markdown, Strapi Blocks).
// Each source's parser produces the same normalized shape:
//   { sections: [{heading, html}], flatHtml: string|null }
// `flatHtml` is used when there are no section headings at all.
// ---------------------------------------------------------------------------

function wrapSectionsHtml(sections) {
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

function wrapFlatHtml(html) {
  return `
<section class="section">
  <div class="container">
    <div class="case-body">
      ${html}
    </div>
  </div>
</section>`;
}

/** Render a Markdown body (## headings become sections) into final HTML. */
function renderMarkdownBody(rawBody) {
  const headingRe = /^##\s+(.+)$/gm;
  const matches = [...rawBody.matchAll(headingRe)];

  if (matches.length === 0) {
    return wrapFlatHtml(marked.parse(rawBody));
  }

  const sections = [];
  for (let i = 0; i < matches.length; i++) {
    const heading = matches[i][1].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : rawBody.length;
    const sectionMarkdown = rawBody.slice(start, end).trim();
    sections.push({ heading, html: marked.parse(sectionMarkdown) });
  }
  return wrapSectionsHtml(sections);
}

/**
 * Render Strapi's "Blocks" rich-text JSON format into final HTML.
 * Level-2 headings become section breaks (matching the Markdown convention);
 * everything else renders as flowing prose. Best-effort: an unrecognized
 * node type is skipped rather than crashing the whole build.
 */
/**
 * Strapi's Blocks editor often produces one single-item "list" node per
 * bullet (pressing Enter between bullets splits them) rather than one list
 * node with many list-items — merge adjacent same-format lists back into
 * one, and drop empty paragraph nodes (blank lines), so the output looks
 * like a normal bullet list instead of several stacked one-item lists.
 */
function preprocessBlocks(blocks) {
  const merged = [];
  for (const node of blocks) {
    if (node.type === "paragraph") {
      const text = (node.children || []).map((c) => c.text || "").join("").trim();
      if (!text) continue;
    }
    const prev = merged[merged.length - 1];
    if (node.type === "list" && prev && prev.type === "list" && prev.format === node.format) {
      prev.children = [...(prev.children || []), ...(node.children || [])];
      continue;
    }
    merged.push({ ...node });
  }
  return merged;
}

function renderStrapiBlocksBody(rawBlocks) {
  if (!Array.isArray(rawBlocks) || !rawBlocks.length) return "";
  const blocks = preprocessBlocks(rawBlocks);

  function inlineToHtml(children) {
    if (!Array.isArray(children)) return "";
    return children
      .map((node) => {
        if (node.type === "link") {
          return `<a href="${escapeHtml(node.url || "")}">${inlineToHtml(node.children)}</a>`;
        }
        // Plain text leaf node, possibly with formatting marks.
        let text = escapeHtml(node.text || "");
        if (node.code) text = `<code>${text}</code>`;
        if (node.bold) text = `<strong>${text}</strong>`;
        if (node.italic) text = `<em>${text}</em>`;
        if (node.underline) text = `<u>${text}</u>`;
        if (node.strikethrough) text = `<s>${text}</s>`;
        return text;
      })
      .join("");
  }

  function blockToHtml(node) {
    switch (node.type) {
      case "paragraph":
        return `<p>${inlineToHtml(node.children)}</p>`;
      case "heading": {
        // A sub-heading appearing *within* a section (level-2 splits happen
        // before this is ever called) — render one level down from the
        // section's own <h3> so it doesn't compete visually.
        const level = Math.min(Math.max((node.level || 3) + 1, 4), 6);
        return `<h${level}>${inlineToHtml(node.children)}</h${level}>`;
      }
      case "list": {
        const tag = node.format === "ordered" ? "ol" : "ul";
        const items = (node.children || [])
          .map((li) => `<li>${inlineToHtml(li.children)}</li>`)
          .join("");
        return `<${tag}>${items}</${tag}>`;
      }
      case "quote":
        return `<blockquote><p>${inlineToHtml(node.children)}</p></blockquote>`;
      case "code":
        return `<pre><code>${escapeHtml((node.children || []).map((c) => c.text || "").join(""))}</code></pre>`;
      case "image": {
        const src = resolveMediaUrl(node.image) || "";
        const alt = escapeHtml(node.image?.alternativeText || "");
        return src ? `<img src="${escapeHtml(src)}" alt="${alt}" />` : "";
      }
      default:
        return "";
    }
  }

  function headingText(node) {
    return (node.children || []).map((c) => c.text || "").join("").trim();
  }

  const sectionBreaks = blocks
    .map((node, i) => ({ node, i }))
    .filter(({ node }) => node.type === "heading" && node.level === 2);

  if (sectionBreaks.length === 0) {
    return wrapFlatHtml(blocks.map(blockToHtml).join("\n"));
  }

  const sections = sectionBreaks.map(({ node, i }, idx) => {
    const start = i + 1;
    const end = idx + 1 < sectionBreaks.length ? sectionBreaks[idx + 1].i : blocks.length;
    const html = blocks.slice(start, end).map(blockToHtml).join("\n");
    return { heading: headingText(node), html };
  });
  return wrapSectionsHtml(sections);
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

function renderHeroBannerBlock(heroImage, title) {
  if (!heroImage) return "";
  return `
<section class="section" style="padding-bottom:0;">
  <div class="container">
    <div class="case-hero-banner">
      <img src="${escapeHtml(heroImage)}" alt="${escapeHtml(title)}" />
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
    .map((b) => {
      const icon = b.icon
        ? `<div class="icon"><img src="${escapeHtml(b.icon)}" alt="" style="width:28px;height:28px;object-fit:contain;" /></div>`
        : "";
      return `
      <div class="card">
        ${icon}
        <h3>${escapeHtml(b.title)}</h3>
        <p>${escapeHtml(b.description)}</p>
      </div>`;
    })
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

/** Shared listing-style card, used by both the index page and "Other Case Stories". */
function renderStoryCard(s) {
  const thumb = s.heroImage
    ? `<div class="card-thumb"><img src="${escapeHtml(s.heroImage)}" alt="${escapeHtml(s.title)}" /></div>`
    : "";
  const isDemo = s.sourceFile.startsWith("_");
  const dateLabel = isDemo ? `${escapeHtml(s.category)} &middot; Demo` : escapeHtml(s.category);
  return `
      <div class="card blog-card">
        ${thumb}
        <div class="date">${dateLabel}</div>
        <h3><a href="/case-studies/${s.slug}.html">${escapeHtml(s.title)}</a></h3>
        <p>${escapeHtml(s.heroSummary)}</p>
        <a href="/case-studies/${s.slug}.html">Read the Story &rarr;</a>
      </div>`;
}

function renderOtherStoriesBlock(currentSlug, allStories, max = 3) {
  const others = allStories.filter((s) => s.slug !== currentSlug).slice(0, max);
  if (!others.length) return "";
  const cards = others.map(renderStoryCard).join("");
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
    renderHeroBannerBlock(story.heroImage, story.title),
    renderTagsBlock(story.tags),
    story.bodyHtml || "",
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

  const cards = stories.map(renderStoryCard).join("\n");

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

// ---------------------------------------------------------------------------
// llms.txt — sentinel-delimited block insertion/replacement
// ---------------------------------------------------------------------------

const LLMS_START = "<!-- CASE-STUDIES:START -->";
const LLMS_END = "<!-- CASE-STUDIES:END -->";

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

async function main() {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

  const localStories = loadCaseStudies();
  const strapiStories = await fetchStrapiCaseStudies();

  // Duplicate slugs across the two sources are a build error, same as a
  // duplicate within one source (already checked inside loadCaseStudies).
  const seen = new Map();
  for (const s of [...localStories, ...strapiStories]) {
    if (seen.has(s.slug)) {
      throw new Error(
        `Duplicate slug "${s.slug}" found in both ${seen.get(s.slug)} and ${s.sourceFile} — slugs must be unique across local .md files and Strapi entries.`
      );
    }
    seen.set(s.slug, s.sourceFile);
  }

  const stories = [...localStories, ...strapiStories].sort((a, b) => (a.publishDate < b.publishDate ? 1 : -1));

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

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
