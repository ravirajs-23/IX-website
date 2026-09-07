#!/usr/bin/env node
/**
 * build-case-studies.js
 *
 * Strapi is the SOLE source of truth for case studies (as of 2026-09-07 —
 * previously this also read local Markdown+front-matter files from
 * content/case-studies/, merged alongside Strapi; that hybrid model was
 * dropped because it let case-studies/ drift out of sync with Strapi's own
 * content — see content/case-studies-archived/ for the old real content,
 * kept for reference/possible migration into Strapi, no longer built).
 *
 * Every run:
 *   1. Fetches the current set of case-story entries from Strapi.
 *   2. Renders each into case-studies/<slug>.html + the case-studies.html
 *      listing page, through templates/template.html.
 *   3. Deletes any case-studies/*.html file whose slug is no longer present
 *      in Strapi — so the folder always exactly mirrors Strapi, with no
 *      stale/orphaned pages left behind when an entry is removed there.
 *   4. Regenerates sitemap.xml and the case-studies block of llms.txt.
 *
 * Strapi env vars (required — set in .env, see .env.example):
 *   STRAPI_URL         e.g. http://localhost:1337
 *   STRAPI_API_TOKEN   a Strapi API token (read access is enough)
 * If unset or unreachable, the build proceeds with zero case studies
 * (existing generated pages are cleaned up, not left stale) rather than
 * failing outright — see fetchStrapiCaseStudies().
 *
 * Usage: node scripts/build-case-studies.js   (or: npm run build:case-studies)
 */

const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const ROOT = path.join(__dirname, "..");
const TEMPLATE_PATH = path.join(ROOT, "templates", "template.html");
const PARTIALS_DIR = path.join(ROOT, "templates", "partials");
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

/** OG/Twitter image tags need a fully-qualified URL — prefix root-relative paths. */
function toAbsoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  return pathOrUrl.startsWith("http") ? pathOrUrl : `${SITE_URL}${pathOrUrl}`;
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + "…";
}

const MEDIA_MIRROR_DIR = path.join(ROOT, "images", "case-studies", "strapi");
// Populated by mirrorAllStrapiMedia() before any rendering happens — maps
// an absolute Strapi media URL to the root-relative local path it was
// downloaded to. Keeps resolveMediaUrl() synchronous (it's called from deep
// inside recursive, sync render functions) despite the download being async.
const mediaMirrorMap = new Map();

/** Resolve a Strapi media field (single media) to a usable URL, or null. */
function resolveMediaUrl(media) {
  if (!media) return null;
  // Strapi v5 returns media fields as a plain object with `.url`; be
  // defensive about the v4-style `{ data: { attributes: { url } } }` shape
  // too, in case of an older/differently-configured instance.
  const url = media.url || media?.data?.attributes?.url || null;
  if (!url) return null;
  const absolute = url.startsWith("http") ? url : `${STRAPI_URL}${url}`;
  // Media actually hosted on this Strapi instance (as opposed to some
  // future external/CDN URL) is mirrored into this repo at build time — see
  // mirrorAllStrapiMedia() — so the live site never depends on Strapi's own
  // URL (today, just localhost) being reachable by an actual visitor. Only
  // the *build* needs Strapi reachable, same as the API call itself.
  if (absolute.startsWith(STRAPI_URL) && mediaMirrorMap.has(absolute)) {
    return mediaMirrorMap.get(absolute);
  }
  return absolute;
}

/** Every media object ({url, mime, ...}) referenced anywhere in one Strapi
 * entry, including inline images inside CaseDetails Blocks content — so
 * mirrorAllStrapiMedia() can download all of them up front. */
function collectMediaObjects(entry) {
  const media = [];
  if (entry.BGImage) media.push(entry.BGImage);
  if (entry.OGimage) media.push(entry.OGimage);
  if (entry.CaseDetailsImageVideo) media.push(entry.CaseDetailsImageVideo);
  for (const b of entry.case_benefits_and_impacts || []) {
    if (b.IconImage) media.push(b.IconImage);
  }
  if (Array.isArray(entry.CaseDetails)) {
    for (const node of entry.CaseDetails) {
      if (node.type === "image" && node.image) media.push(node.image);
    }
  }
  return media;
}

/**
 * Downloads every Strapi-hosted media file referenced by these entries into
 * images/case-studies/strapi/ and records the mapping in mediaMirrorMap.
 * Must run (and be awaited) before any story is mapped/rendered.
 *
 * Without this, a relative Strapi media URL resolves to e.g.
 * "http://localhost:1337/uploads/photo.webp" — fine for previewing on the
 * same machine as Strapi, completely broken for an actual site visitor.
 * A failed download is logged and left as the raw (broken) URL rather than
 * failing the whole build, since a bad image shouldn't block a text fix.
 */
async function mirrorAllStrapiMedia(entries) {
  const seen = new Set();
  for (const entry of entries) {
    for (const media of collectMediaObjects(entry)) {
      const rawUrl = media.url || media?.data?.attributes?.url || null;
      if (!rawUrl) continue;
      const absoluteUrl = rawUrl.startsWith("http") ? rawUrl : `${STRAPI_URL}${rawUrl}`;
      if (!absoluteUrl.startsWith(STRAPI_URL) || seen.has(absoluteUrl)) continue;
      seen.add(absoluteUrl);

      const filename = path.basename(new URL(absoluteUrl).pathname);
      const localPath = path.join(MEDIA_MIRROR_DIR, filename);
      const publicPath = `/images/case-studies/strapi/${filename}`;

      if (fs.existsSync(localPath)) {
        mediaMirrorMap.set(absoluteUrl, publicPath);
        continue;
      }

      try {
        const res = await fetch(absoluteUrl);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const buf = Buffer.from(await res.arrayBuffer());
        fs.mkdirSync(MEDIA_MIRROR_DIR, { recursive: true });
        fs.writeFileSync(localPath, buf);
        mediaMirrorMap.set(absoluteUrl, publicPath);
        console.log(`✓ mirrored ${filename}`);
      } catch (err) {
        console.warn(
          `⚠ Could not mirror Strapi media ${absoluteUrl} (${err.message}) — this image will be broken on the live site until fixed.`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Load case studies from Strapi — the sole content source
// ---------------------------------------------------------------------------

/** Map one Strapi case-story API entry into the same internal story shape. */
function mapStrapiEntryToStory(entry) {
  const industry =
    entry.master_industry_types?.[0]?.IndustryName ||
    entry.master_industries_types?.[0]?.IndustryName ||
    "General";

  const heroImage = resolveMediaUrl(entry.BGImage);
  const ogImage = resolveMediaUrl(entry.OGimage) || heroImage;

  // Inline banner shown above "Business Problem" on the live site — a
  // separate field from BGImage (the hero background). Strapi allows this
  // to be an image, file, or video; branch on mime type for video support.
  const detailImageUrl = resolveMediaUrl(entry.CaseDetailsImageVideo);
  const detailImage = detailImageUrl
    ? { url: detailImageUrl, isVideo: (entry.CaseDetailsImageVideo?.mime || "").startsWith("video/") }
    : null;

  const heroSummary = entry.OGdescription || entry.SEOdescription || entry.Title;
  const metaDescription = entry.SEOdescription || entry.OGdescription || truncate(heroSummary, 155);

  const benefits = (entry.case_benefits_and_impacts || []).map((b) => ({
    title: b.Title,
    description: b.ShortDescription,
    icon: resolveMediaUrl(b.IconImage),
  }));

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
    // .trim(): Strapi content-entry data can carry incidental leading/
    // trailing whitespace (e.g. a trailing space left in the Title field)
    // that would otherwise show up literally in <title>, <h1>, and JSON-LD.
    title: entry.Title.trim(),
    category: industry,
    // Strapi's case-story schema has no dedicated "client" field (and the
    // current template doesn't render one), so this is left empty here.
    client: "",
    publishDate: (entry.publishedAt || entry.createdAt || "").slice(0, 10),
    heroSummary,
    metaDescription,
    heroImage,
    ogImage,
    detailImage,
    tags: (entry.TagsCommaSeparated || "").split(",").map((t) => t.trim()).filter(Boolean),
    // No dedicated numeric-stat equivalent in the Strapi schema today.
    stats: [],
    benefits,
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
  params.set("populate[BGImage]", "true");
  params.set("populate[OGimage]", "true");
  params.set("populate[CaseDetailsImageVideo]", "true");
  params.set("populate[master_industry_types]", "true");
  params.set("populate[master_industries_types]", "true");
  params.set("pagination[pageSize]", "100");

  let res;
  try {
    res = await fetch(`${STRAPI_URL}/api/case-stories?${params.toString()}`, {
      headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
    });
  } catch (err) {
    // Strapi is configured but unreachable right now (e.g. not running
    // locally) — don't fail the whole build over it, just skip this source.
    console.warn(`⚠ Could not reach Strapi at ${STRAPI_URL} (${err.message}) — skipping the Strapi content source.`);
    return [];
  }
  if (!res.ok) {
    // A real HTTP-level error (bad token, wrong path, etc.) is worth
    // failing loudly for, unlike "the server just isn't running".
    throw new Error(`Strapi API request failed: ${res.status} ${res.statusText} (${STRAPI_URL}/api/case-stories)`);
  }
  const json = await res.json();
  const rawEntries = json.data || [];
  console.log(`✓ fetched ${rawEntries.length} case-stor${rawEntries.length === 1 ? "y" : "ies"} from Strapi (${STRAPI_URL})`);

  // Defensive: an entry missing required fields (e.g. an empty/unset slug,
  // which is possible if it was published before Strapi's uid field had a
  // chance to auto-generate) must never reach the template — skip it with
  // a clear warning rather than silently emitting a broken page/URL.
  const valid = [];
  for (const entry of rawEntries) {
    const missing = ["slug", "Title"].filter((f) => !entry[f]);
    if (missing.length) {
      console.warn(
        `⚠ Skipping Strapi entry id=${entry.id} — missing required field(s): ${missing.join(
          ", "
        )}. Fix it in the Strapi admin (Content Manager → Case Stories → id ${entry.id}).`
      );
      continue;
    }
    valid.push(entry);
  }

  await mirrorAllStrapiMedia(valid);

  return valid.map(mapStrapiEntryToStory);
}

/**
 * The "TRUSTIMONIALS" carousel on the live site is NOT per-case-story — it
 * renders the exact same full list of testimonials on every single
 * case-story detail page (verified directly against the live site: two
 * unrelated case stories showed byte-identical testimonial carousels, same
 * order). So unlike everything else in this file, this pulls from Strapi's
 * standalone `testimonial` collection (/api/testimonials) rather than any
 * per-entry relation on the case-story itself.
 */
async function fetchAllTestimonials() {
  if (!STRAPI_URL || !STRAPI_API_TOKEN) return [];

  let res;
  try {
    res = await fetch(`${STRAPI_URL}/api/testimonials?pagination[pageSize]=100`, {
      headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
    });
  } catch (err) {
    console.warn(`⚠ Could not reach Strapi for testimonials (${err.message}) — the testimonials carousel will be empty.`);
    return [];
  }
  if (!res.ok) {
    throw new Error(`Strapi API request failed: ${res.status} ${res.statusText} (${STRAPI_URL}/api/testimonials)`);
  }
  const json = await res.json();
  const entries = json.data || [];

  return entries
    .filter((e) => e.Testimonial && e.TestimonyName)
    .map((e) => ({
      quote: e.Testimonial,
      author: e.TestimonyName,
      role: e.Designation || "",
      company: e.Company || "",
    }));
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
    <div class="cs-content-section">
      <h3>${escapeHtml(s.heading)}</h3>
      ${s.html}
    </div>`
    )
    .join("\n");
  return `
<section class="section">
  <div class="container">${items}
  </div>
</section>`;
}

function wrapFlatHtml(html) {
  return `
<section class="section">
  <div class="container">
    <div class="cs-content-section" style="max-width:820px;margin:0 auto;">
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

// Every benefit card shows an icon on the live site, even when no custom
// one is set per-benefit — falls back to this generic growth/impact icon.
const DEFAULT_BENEFIT_ICON = "/images/case-studies/_benefit-icon-default.svg";

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
 * page (see fetchAllTestimonials() for why). Markup renders just the first
 * testimonial (so the page is meaningful with JS disabled and has real
 * content for crawlers/SEO); js/script.js's testimonials-carousel
 * controller hydrates it into an auto-advancing carousel over the full
 * list, which travels with the page as a JSON blob.
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

/** Shared card, used by the listing grid and "Other Case Stories" — matches the live site's card exactly. */
function renderStoryCard(s) {
  const media = s.heroImage
    ? `<img src="${escapeHtml(s.heroImage)}" alt="${escapeHtml(s.title)}" />`
    : `<div class="cs-card-noimg"></div>`;
  const isDemo = s.sourceFile.startsWith("_");
  const tagLabel = isDemo ? `${escapeHtml(s.category)} &middot; Demo` : escapeHtml(s.category);
  return `
      <a class="cs-card" href="/case-studies/${s.slug}.html" data-category="${escapeHtml(s.category)}" data-title="${escapeHtml(s.title)}">
        ${media}
        <div class="cs-card-body">
          <div class="cs-tag">${tagLabel}</div>
          <h3>${escapeHtml(s.title)}</h3>
          <p>${escapeHtml(s.heroSummary)}</p>
          <span class="cs-read-more">READ MORE</span>
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

// ---------------------------------------------------------------------------
// Build one detail page
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Build the listing/index page
// ---------------------------------------------------------------------------

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
  // Single source of truth for header/footer, shared with the hand-written
  // pages via scripts/build-pages.js — edit templates/partials/*.html, not
  // this template or any individual page, to change nav/footer content.
  const partials = {
    header: fs.readFileSync(path.join(PARTIALS_DIR, "header.html"), "utf8").trim(),
    footer: fs.readFileSync(path.join(PARTIALS_DIR, "footer.html"), "utf8").trim(),
  };

  const strapiStories = await fetchStrapiCaseStudies();
  const testimonials = await fetchAllTestimonials();
  console.log(`✓ fetched ${testimonials.length} testimonial${testimonials.length === 1 ? "" : "s"} for the carousel`);

  // A duplicate slug across Strapi entries is a build error (fetchStrapiCaseStudies
  // already skips entries with no slug at all, but two different entries could
  // still share one typo'd into both).
  const seen = new Map();
  for (const s of strapiStories) {
    if (seen.has(s.slug)) {
      throw new Error(
        `Duplicate slug "${s.slug}" found in both ${seen.get(s.slug)} and ${s.sourceFile} — slugs must be unique across Strapi entries.`
      );
    }
    seen.set(s.slug, s.sourceFile);
  }

  const stories = strapiStories.sort((a, b) => (a.publishDate < b.publishDate ? 1 : -1));

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const currentSlugs = new Set(stories.map((s) => s.slug));

  for (const story of stories) {
    const html = buildDetailPage(story, template, stories, partials, testimonials);
    const outPath = path.join(OUTPUT_DIR, `${story.slug}.html`);
    fs.writeFileSync(outPath, html, "utf8");
    console.log(`✓ wrote case-studies/${story.slug}.html`);
  }

  // Strapi is the sole source of truth: any previously generated page whose
  // slug is no longer in the current Strapi fetch (entry deleted/renamed
  // there, or left over from the old local-.md content model) must not
  // linger — delete it so case-studies/ always exactly mirrors Strapi.
  for (const file of fs.readdirSync(OUTPUT_DIR)) {
    if (!file.endsWith(".html")) continue;
    const slug = file.slice(0, -".html".length);
    if (!currentSlugs.has(slug)) {
      fs.unlinkSync(path.join(OUTPUT_DIR, file));
      console.log(`✗ removed stale case-studies/${file} (no matching Strapi entry)`);
    }
  }

  const indexHtml = buildIndexPage(stories, template, partials);
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
