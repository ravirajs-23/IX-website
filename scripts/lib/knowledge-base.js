/**
 * knowledge-base.js
 *
 * Everything the chatbot (api/chat.js) needs to ground its answers in the
 * site's real content. Three jobs:
 *   1. buildCoreSummary() — a small, ALWAYS-in-context summary: company
 *      facts, services, industries, other pages, plus only an aggregate
 *      case-study overview (total + per-category counts). Deliberately
 *      does NOT grow with case-study count — see listCaseStudies() below
 *      for why. Small enough to sit in the system prompt on every request.
 *   2. listCaseStudies({category, keyword, limit}) — on-demand, structured
 *      (not semantic) filtering over the manifest, for when a question
 *      needs specific case studies. This is what keeps buildCoreSummary()
 *      bounded: earlier this had one line per case study baked into the
 *      always-in-context summary, which meant prompt size grew forever
 *      with case-study count (already 101+ and actively growing — 8 more
 *      surfaced in a single review run). Moving the per-item list behind
 *      a deterministic filter tool — not a vector DB; the corpus easily
 *      fits in context and is already cleanly tagged by category, so
 *      exact filtering gets most of semantic search's benefit without the
 *      embeddings/vector-store/chunking machinery — keeps the always-in
 *      layer's size constant regardless of how many case studies exist.
 *   3. getPageContent(path) — fetches one specific page's real full text,
 *      for when even a filtered case-study summary isn't enough depth.
 *      Only ever serves paths from getFetchablePaths()'s allowlist — never
 *      arbitrary filesystem reads off a model-supplied string.
 *
 * Zero network access — reads only committed repo files, same discipline
 * as scripts/build-case-studies.js.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const MAX_PAGE_CONTENT_CHARS = 8000;

function loadCaseStudies() {
  const manifestPath = path.join(ROOT, "data", "case-studies-manifest.json");
  if (!fs.existsSync(manifestPath)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return Object.values(manifest.stories).map((e) => e.story);
}

function loadCompanyFacts() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "company-facts.json"), "utf8"));
}

function categoryCounts(stories) {
  const byCategory = {};
  for (const s of stories) {
    const cat = (s.category || "Uncategorized").trim();
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  return byCategory;
}

function buildCoreSummary() {
  const stories = loadCaseStudies();
  const facts = loadCompanyFacts();
  const lines = [];

  lines.push(`# ${facts.companyName} — knowledge base`);
  lines.push(facts.tagline);
  lines.push("");

  lines.push("## Company");
  lines.push(`Offices: ${facts.presence.map((p) => (p.note ? `${p.location} (${p.note})` : p.location)).join(", ")}`);
  lines.push(facts.geographyNote);
  lines.push("Co-founders:");
  for (const cf of facts.coFounders) {
    lines.push(`- ${cf.name}, ${cf.role} — ${cf.url} (LinkedIn: ${cf.linkedin})`);
  }
  lines.push("");

  lines.push("## Services");
  for (const s of facts.services) lines.push(`- ${s.name} — ${s.url}`);
  lines.push("");

  lines.push("## Industries served");
  lines.push(facts.industries.join(", "));
  lines.push("");

  lines.push("## Other pages");
  for (const p of facts.otherPages) lines.push(`- ${p.title} — ${p.url} — ${p.summary}`);
  lines.push("");

  // Aggregate only — deliberately NOT one line per case study. See the
  // module header comment for why; use the list_case_studies tool
  // (listCaseStudies below) to get specifics instead of guessing.
  const counts = categoryCounts(stories);
  const byCategoryText = Object.entries(counts)
    .map(([cat, n]) => `${cat} (${n})`)
    .join(", ");
  lines.push("## Case studies");
  lines.push(`${stories.length} total, by category: ${byCategoryText}.`);
  lines.push(
    "Use the list_case_studies tool to get specific case studies by category and/or a keyword — never guess a title, URL, or detail that isn't actually returned by it."
  );

  return lines.join("\n");
}

const LIST_CASE_STUDIES_DEFAULT_LIMIT = 20;
const LIST_CASE_STUDIES_MAX_LIMIT = 20;

/**
 * Structured (not semantic) filtering over the case-studies manifest —
 * exact category match, substring keyword match against title/tags/
 * summary/benefit titles. Deterministic, zero embeddings. Always bounded
 * by LIST_CASE_STUDIES_MAX_LIMIT, with a plain note when more match than
 * were returned, so even a single very large category stays a small,
 * fixed-size response.
 */
function listCaseStudies({ category, keyword, limit } = {}) {
  let stories = loadCaseStudies();

  if (typeof category === "string" && category.trim()) {
    const wanted = category.trim().toLowerCase();
    stories = stories.filter((s) => (s.category || "").trim().toLowerCase() === wanted);
  }

  if (typeof keyword === "string" && keyword.trim()) {
    const kw = keyword.trim().toLowerCase();
    stories = stories.filter((s) => {
      const haystack = [s.title, s.heroSummary, ...(s.tags || []), ...((s.benefits || []).map((b) => b.title))]
        .join(" ")
        .toLowerCase();
      return haystack.includes(kw);
    });
  }

  const total = stories.length;
  const requested = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : LIST_CASE_STUDIES_DEFAULT_LIMIT;
  const cap = Math.min(requested, LIST_CASE_STUDIES_MAX_LIMIT);
  const truncated = total > cap;
  const sliced = stories.slice(0, cap);

  const items = sliced.map((s) => {
    const benefitTitles = (s.benefits || []).map((b) => b.title);
    return {
      title: s.title,
      category: s.category,
      url: `/case-studies/${s.slug}.html`,
      summary: s.heroSummary,
      benefits: benefitTitles.length ? benefitTitles : null,
    };
  });

  return {
    total,
    returned: items.length,
    truncated,
    note: truncated
      ? `${total} case studies match — showing the first ${items.length}. Narrow further (category and/or a more specific keyword) if the visitor needs a different subset.`
      : null,
    items,
  };
}

function getFetchablePaths() {
  const stories = loadCaseStudies();
  const facts = loadCompanyFacts();
  const paths = new Set(["/about.html", "/services.html", "/index.html", "/case-studies.html"]);
  for (const s of stories) paths.add(`/case-studies/${s.slug}.html`);
  for (const p of facts.otherPages) paths.add(p.url);
  for (const s of facts.services) paths.add(s.url);
  return paths;
}

/** Strips the shared header/footer blocks (same content on
 * every page, pure noise for a per-page fetch) and all tags, leaving plain
 * visible text. */
function extractVisibleText(html) {
  let body = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) body = bodyMatch[1];

  body = body
    .replace(/<!-- SITE-HEADER:START -->[\s\S]*?<!-- SITE-HEADER:END -->/, "")
    .replace(/<!-- SITE-FOOTER:START -->[\s\S]*?<!-- SITE-FOOTER:END -->/, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&rsquo;/g, "’")
    .replace(/\s+/g, " ")
    .trim();

  return body;
}

function getPageContent(requestedPath) {
  const allowed = getFetchablePaths();
  if (typeof requestedPath !== "string" || !allowed.has(requestedPath)) {
    return { error: `"${requestedPath}" isn't a page this tool can fetch. Use an exact path from the knowledge base.` };
  }
  const filePath = path.join(ROOT, requestedPath.replace(/^\//, ""));
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath)) {
    return { error: `Page file not found for "${requestedPath}".` };
  }
  const html = fs.readFileSync(filePath, "utf8");
  let text = extractVisibleText(html);
  if (text.length > MAX_PAGE_CONTENT_CHARS) {
    text = text.slice(0, MAX_PAGE_CONTENT_CHARS) + "… (truncated)";
  }
  return { path: requestedPath, text };
}

module.exports = { buildCoreSummary, listCaseStudies, getFetchablePaths, getPageContent };
