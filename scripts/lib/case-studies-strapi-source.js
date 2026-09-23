/**
 * case-studies-strapi-source.js
 *
 * Everything that talks to Strapi: fetching entries/testimonials, mapping a
 * raw Strapi entry into the internal "story" shape, mirroring Strapi-hosted
 * media into this repo, and computing the content hash/snapshot used to
 * detect new vs. updated stories. Used ONLY by scripts/review-case-studies.js,
 * scripts/publish-case-studies.js, and scripts/seed-case-studies-manifest.js
 * — never by scripts/build-case-studies.js (the site build), which reads
 * only the frozen manifest and has no network access at all.
 */
const fs = require("fs");
const path = require("path");
const { marked } = require("marked");
const { canonicalStringify } = require("./canonical-json");

const ROOT = path.join(__dirname, "..", "..");
const MEDIA_MIRROR_DIR = path.join(ROOT, "images", "case-studies", "strapi");

const STRAPI_URL = () => process.env.STRAPI_URL || "";
const STRAPI_API_TOKEN = () => process.env.STRAPI_API_TOKEN || "";

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + "…";
}

// ---------------------------------------------------------------------------
// Media mirroring — populated fresh each run (only for entries actually being
// mapped, i.e. new/updated/approved ones — not every entry in Strapi).
// ---------------------------------------------------------------------------

/** Resolve a Strapi media field (single media) to a usable URL, or null. */
function resolveMediaUrl(media, mediaMirrorMap) {
  if (!media) return null;
  // Strapi v5 returns media fields as a plain object with `.url`; be
  // defensive about the v4-style `{ data: { attributes: { url } } }` shape
  // too, in case of an older/differently-configured instance.
  const url = media.url || media?.data?.attributes?.url || null;
  if (!url) return null;
  const strapiUrl = STRAPI_URL();
  const absolute = url.startsWith("http") ? url : `${strapiUrl}${url}`;
  if (absolute.startsWith(strapiUrl) && mediaMirrorMap.has(absolute)) {
    return mediaMirrorMap.get(absolute);
  }
  return absolute;
}

/** Every media object ({url, mime, ...}) referenced anywhere in one Strapi
 * entry, including inline images inside CaseDetails Blocks content — so
 * mirrorMedia() can download all of them up front. */
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
 * images/case-studies/strapi/ and returns a Map of absolute Strapi URL ->
 * root-relative local path. Only call this for entries you're actually about
 * to approve/render — reviewing (without approving) should never write image
 * files into the working tree.
 */
async function mirrorMedia(entries) {
  const mediaMirrorMap = new Map();
  const seen = new Set();
  const strapiUrl = STRAPI_URL();
  for (const entry of entries) {
    for (const media of collectMediaObjects(entry)) {
      const rawUrl = media.url || media?.data?.attributes?.url || null;
      if (!rawUrl) continue;
      const absoluteUrl = rawUrl.startsWith("http") ? rawUrl : `${strapiUrl}${rawUrl}`;
      if (!absoluteUrl.startsWith(strapiUrl) || seen.has(absoluteUrl)) continue;
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
          `⚠ Could not mirror Strapi media ${absoluteUrl} (${err.message}) — this image will be broken until fixed.`
        );
      }
    }
  }
  return mediaMirrorMap;
}

// ---------------------------------------------------------------------------
// Body rendering (Markdown / Strapi Blocks -> HTML). Runs once, at the point
// a story is approved and frozen into the manifest — not on every build.
// ---------------------------------------------------------------------------

function wrapSectionsHtml(sections) {
  const items = sections
    .map(
      (s) => `
    <div class="cs-content-section">
      <h3>${escapeHtmlLocal(s.heading)}</h3>
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

// Small local copy — case-studies-core.js's escapeHtml isn't imported here to
// keep this module's only cross-dependency limited to canonical-json (this
// function is trivial enough that duplicating it beats a circular-ish import
// for what's a one-liner used just for heading text).
function escapeHtmlLocal(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
 * Strapi's Blocks editor often produces one single-item "list" node per
 * bullet (pressing Enter between bullets splits them) rather than one list
 * node with many list-items — merge adjacent same-format lists back into
 * one, and drop empty paragraph nodes (blank lines).
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

function renderStrapiBlocksBody(rawBlocks, mediaMirrorMap) {
  if (!Array.isArray(rawBlocks) || !rawBlocks.length) return "";
  const blocks = preprocessBlocks(rawBlocks);

  function inlineToHtml(children) {
    if (!Array.isArray(children)) return "";
    return children
      .map((node) => {
        if (node.type === "link") {
          return `<a href="${escapeHtmlLocal(node.url || "")}">${inlineToHtml(node.children)}</a>`;
        }
        let text = escapeHtmlLocal(node.text || "");
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
        return `<pre><code>${escapeHtmlLocal((node.children || []).map((c) => c.text || "").join(""))}</code></pre>`;
      case "image": {
        const src = resolveMediaUrl(node.image, mediaMirrorMap) || "";
        const alt = escapeHtmlLocal(node.image?.alternativeText || "");
        return src ? `<img src="${escapeHtmlLocal(src)}" alt="${alt}" />` : "";
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

// ---------------------------------------------------------------------------
// Mapping a raw Strapi entry -> the frozen "story" shape + a smaller,
// diff/hash-friendly "source snapshot" shape.
// ---------------------------------------------------------------------------

/** Map one Strapi case-story API entry into the internal story shape,
 * resolving media through the given mirror map (already mirrored, or raw
 * Strapi URLs if this entry is only being reviewed, not approved). */
function mapStrapiEntryToStory(entry, mediaMirrorMap) {
  const industry =
    entry.master_industry_types?.[0]?.IndustryName ||
    entry.master_industries_types?.[0]?.IndustryName ||
    "General";

  const heroImage = resolveMediaUrl(entry.BGImage, mediaMirrorMap);
  const ogImage = resolveMediaUrl(entry.OGimage, mediaMirrorMap) || heroImage;

  const detailImageUrl = resolveMediaUrl(entry.CaseDetailsImageVideo, mediaMirrorMap);
  const detailImage = detailImageUrl
    ? { url: detailImageUrl, isVideo: (entry.CaseDetailsImageVideo?.mime || "").startsWith("video/") }
    : null;

  const heroSummary = entry.OGdescription || entry.SEOdescription || entry.Title;
  const metaDescription = entry.SEOdescription || entry.OGdescription || truncate(heroSummary, 155);

  const benefits = (entry.case_benefits_and_impacts || []).map((b) => ({
    title: b.Title,
    description: b.ShortDescription,
    icon: resolveMediaUrl(b.IconImage, mediaMirrorMap),
  }));

  let bodyHtml = "";
  if (entry.CaseDetailsMarkdown && entry.CaseDetailsMarkdown.trim()) {
    bodyHtml = renderMarkdownBody(entry.CaseDetailsMarkdown);
  } else if (Array.isArray(entry.CaseDetails) && entry.CaseDetails.length) {
    bodyHtml = renderStrapiBlocksBody(entry.CaseDetails, mediaMirrorMap);
  }

  return {
    slug: entry.slug,
    title: entry.Title.trim(),
    category: industry,
    client: "",
    publishDate: (entry.publishedAt || entry.createdAt || "").slice(0, 10),
    heroSummary,
    metaDescription,
    heroImage,
    ogImage,
    detailImage,
    tags: (entry.TagsCommaSeparated || "").split(",").map((t) => t.trim()).filter(Boolean),
    stats: [],
    benefits,
    bodyHtml,
    sourceFile: `strapi:${entry.slug}`,
  };
}

/**
 * A smaller, diff-friendly shape: raw Strapi URLs (not mirrored paths) and
 * raw body SOURCE (Markdown or Blocks JSON, not rendered HTML). This is what
 * change-detection hashes and diffs against, so a one-word text edit shows as
 * a one-word diff instead of noisy full-HTML churn, and so mirroring/render
 * logic changes never spuriously flag every story as "updated."
 */
function extractSourceSnapshot(entry) {
  const industry =
    entry.master_industry_types?.[0]?.IndustryName ||
    entry.master_industries_types?.[0]?.IndustryName ||
    "General";
  const rawUrl = (media) => media?.url || media?.data?.attributes?.url || null;

  const heroSummary = entry.OGdescription || entry.SEOdescription || entry.Title;
  const metaDescription = entry.SEOdescription || entry.OGdescription || truncate(heroSummary, 155);

  return {
    title: (entry.Title || "").trim(),
    categoryName: industry,
    heroImageUrl: rawUrl(entry.BGImage),
    ogImageUrl: rawUrl(entry.OGimage) || rawUrl(entry.BGImage),
    detailImageUrl: rawUrl(entry.CaseDetailsImageVideo),
    detailImageIsVideo: (entry.CaseDetailsImageVideo?.mime || "").startsWith("video/"),
    tags: (entry.TagsCommaSeparated || "").split(",").map((t) => t.trim()).filter(Boolean),
    heroSummary,
    metaDescription,
    benefits: (entry.case_benefits_and_impacts || []).map((b) => ({
      title: b.Title,
      description: b.ShortDescription,
      iconUrl: rawUrl(b.IconImage),
    })),
    bodySource: entry.CaseDetailsMarkdown && entry.CaseDetailsMarkdown.trim()
      ? { kind: "markdown", raw: entry.CaseDetailsMarkdown }
      : { kind: "blocks", raw: JSON.stringify(entry.CaseDetails || []) },
    publishDate: (entry.publishedAt || entry.createdAt || "").slice(0, 10),
  };
}

function computeContentHash(sourceSnapshot) {
  const crypto = require("crypto");
  return "sha256:" + crypto.createHash("sha256").update(canonicalStringify(sourceSnapshot)).digest("hex");
}

// ---------------------------------------------------------------------------
// Content-completeness warnings — advisory only, never blocking.
// ---------------------------------------------------------------------------

function getContentWarnings(entry, sourceSnapshot) {
  const warnings = [];
  if (!sourceSnapshot.heroImageUrl) {
    warnings.push({ code: "MISSING_HERO_IMAGE", severity: "warning", message: "No hero/banner image set (BGImage)." });
  }
  if (!entry.SEOdescription && !entry.OGdescription) {
    warnings.push({ code: "MISSING_META_DESCRIPTION", severity: "warning", message: "No SEO/OG description set — falls back to a truncated title." });
  }
  const hasBody =
    (entry.CaseDetailsMarkdown && entry.CaseDetailsMarkdown.trim()) ||
    (Array.isArray(entry.CaseDetails) && entry.CaseDetails.length);
  if (!hasBody) {
    warnings.push({ code: "EMPTY_BODY", severity: "warning", message: "No body content (CaseDetailsMarkdown/CaseDetails is empty)." });
  }
  if (!(entry.case_benefits_and_impacts || []).length) {
    warnings.push({ code: "NO_BENEFITS", severity: "warning", message: "No Benefits & Impacts entries linked." });
  }
  const title = (entry.Title || "").trim();
  if (title.length < 5) {
    warnings.push({ code: "TITLE_TOO_SHORT", severity: "warning", message: `Title is unusually short: "${title}".` });
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Fetching from Strapi.
// ---------------------------------------------------------------------------

async function fetchStrapiCaseStudies() {
  const strapiUrl = STRAPI_URL();
  const token = STRAPI_API_TOKEN();
  if (!strapiUrl || !token) {
    throw new Error("STRAPI_URL/STRAPI_API_TOKEN not set — copy .env.example to .env and fill them in.");
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
    res = await fetch(`${strapiUrl}/api/case-stories?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new Error(`Could not reach Strapi at ${strapiUrl} (${err.message}).`);
  }
  if (!res.ok) {
    throw new Error(`Strapi API request failed: ${res.status} ${res.statusText} (${strapiUrl}/api/case-stories)`);
  }
  const json = await res.json();
  const rawEntries = json.data || [];

  const valid = [];
  const errors = [];
  for (const entry of rawEntries) {
    const missing = ["slug", "Title"].filter((f) => !entry[f]);
    if (missing.length) {
      errors.push({
        entryId: entry.id,
        message: `Skipping Strapi entry id=${entry.id} — missing required field(s): ${missing.join(", ")}. Fix it in the Strapi admin (Content Manager → Case Stories → id ${entry.id}).`,
      });
      continue;
    }
    valid.push(entry);
  }

  return { entries: valid, errors };
}

/**
 * The "TRUSTIMONIALS" carousel is NOT per-case-story — it renders the exact
 * same full list of testimonials on every case-story detail page (verified
 * against the live site). So it's pulled from Strapi's standalone
 * `testimonial` collection, not any per-entry relation.
 */
async function fetchAllTestimonials() {
  const strapiUrl = STRAPI_URL();
  const token = STRAPI_API_TOKEN();
  if (!strapiUrl || !token) return [];

  let res;
  try {
    res = await fetch(`${strapiUrl}/api/testimonials?pagination[pageSize]=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.warn(`⚠ Could not reach Strapi for testimonials (${err.message}) — testimonials snapshot left unchanged.`);
    return null;
  }
  if (!res.ok) {
    throw new Error(`Strapi API request failed: ${res.status} ${res.statusText} (${strapiUrl}/api/testimonials)`);
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

module.exports = {
  fetchStrapiCaseStudies,
  fetchAllTestimonials,
  mirrorMedia,
  resolveMediaUrl,
  mapStrapiEntryToStory,
  extractSourceSnapshot,
  computeContentHash,
  getContentWarnings,
};
