#!/usr/bin/env node
/**
 * review-case-studies.js
 *
 * Fetches the current Strapi case-story entries + testimonials and diffs
 * them against data/case-studies-manifest.json (the frozen, approved
 * baseline). Prints ONE JSON object to stdout — this is what the
 * publish-case-studies skill reads and presents to the approver in chat.
 * Makes NO writes (no manifest changes, no media mirroring, no rendered
 * pages) — reviewing never has side effects; only publish-case-studies.js
 * does.
 *
 * Usage:
 *   node scripts/review-case-studies.js                 # full review, JSON to stdout
 *   node scripts/review-case-studies.js --slug=foo --full  # dump one story's
 *     complete current Strapi content (for reading before deciding)
 */
const fs = require("fs");
const path = require("path");
const { Diff } = (() => {
  try {
    return { Diff: require("diff") };
  } catch {
    return { Diff: null };
  }
})();
const { loadDotEnv } = require("./lib/env");

const ROOT = path.join(__dirname, "..");
loadDotEnv(ROOT);

const source = require("./lib/case-studies-strapi-source");
const { canonicalStringify } = require("./lib/canonical-json");

const MANIFEST_PATH = path.join(ROOT, "data", "case-studies-manifest.json");

const args = process.argv.slice(2);
const slugArg = args.find((a) => a.startsWith("--slug="));
const ONE_SLUG = slugArg ? slugArg.slice("--slug=".length) : null;
const FULL = args.includes("--full");

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(
      `Missing ${MANIFEST_PATH} — run \`node scripts/seed-case-studies-manifest.js\` once first ` +
        `(establishes today's already-live stories as the pre-approved baseline).`
    );
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

// ---------------------------------------------------------------------------
// Field-level diff helpers — only used for entries whose contentHash changed.
// ---------------------------------------------------------------------------

function textDiff(before, after) {
  before = before || "";
  after = after || "";
  if (before === after) return null;
  if (!Diff) {
    return { type: "words", before, after, diffText: `- ${before}\n+ ${after}` };
  }
  const parts = Diff.diffWords(before, after);
  const diffText = parts
    .map((p) => (p.added ? `{+${p.value}+}` : p.removed ? `[-${p.value}-]` : p.value))
    .join("");
  return { type: "words", before, after, diffText };
}

const MAX_BODY_DIFF_CHARS = 3000;

function bodyDiff(beforeSource, afterSource) {
  const before = beforeSource?.raw || "";
  const after = afterSource?.raw || "";
  if (before === after && beforeSource?.kind === afterSource?.kind) return null;
  if (!Diff) {
    return { type: "lines", changed: true, diffText: "(body changed — install the `diff` devDependency for a readable diff)" };
  }
  const parts = Diff.diffLines(before, after);
  let diffText = parts
    .map((p) => {
      const prefix = p.added ? "+ " : p.removed ? "- " : "  ";
      return p.value
        .split("\n")
        .filter((line, i, arr) => !(i === arr.length - 1 && line === ""))
        .map((line) => prefix + line)
        .join("\n");
    })
    .join("\n");
  let truncated = false;
  if (diffText.length > MAX_BODY_DIFF_CHARS) {
    diffText = diffText.slice(0, MAX_BODY_DIFF_CHARS) + "\n… (truncated — use --slug=<x> --full to see the complete text)";
    truncated = true;
  }
  return { type: "lines", changed: true, diffText, truncated };
}

function listDiff(before, after, keyFn) {
  before = before || [];
  after = after || [];
  const beforeKeys = new Set(before.map(keyFn));
  const afterKeys = new Set(after.map(keyFn));
  const added = after.filter((x) => !beforeKeys.has(keyFn(x)));
  const removed = before.filter((x) => !afterKeys.has(keyFn(x)));
  if (!added.length && !removed.length) return null;
  return { type: "list", before, after, added, removed };
}

function imageDiff(before, after) {
  if (before === after) return null;
  return { type: "image", before: before || null, after: after || null, changed: true };
}

/** Builds the `diff` object for /api/review's "updated" entries — only
 * fields that actually changed are included. */
function buildStoryDiff(oldSnapshot, newSnapshot) {
  const diff = {};
  const title = textDiff(oldSnapshot.title, newSnapshot.title);
  if (title) diff.title = title;
  const heroSummary = textDiff(oldSnapshot.heroSummary, newSnapshot.heroSummary);
  if (heroSummary) diff.heroSummary = heroSummary;
  const metaDescription = textDiff(oldSnapshot.metaDescription, newSnapshot.metaDescription);
  if (metaDescription) diff.metaDescription = metaDescription;
  const heroImage = imageDiff(oldSnapshot.heroImageUrl, newSnapshot.heroImageUrl);
  if (heroImage) diff.heroImage = heroImage;
  const ogImage = imageDiff(oldSnapshot.ogImageUrl, newSnapshot.ogImageUrl);
  if (ogImage) diff.ogImage = ogImage;
  const detailImage = imageDiff(oldSnapshot.detailImageUrl, newSnapshot.detailImageUrl);
  if (detailImage) diff.detailImage = detailImage;
  const tags = listDiff(oldSnapshot.tags, newSnapshot.tags, (t) => t);
  if (tags) diff.tags = tags;
  const benefits = listDiff(oldSnapshot.benefits, newSnapshot.benefits, (b) => b.title);
  if (benefits) diff.benefits = benefits;
  const body = bodyDiff(oldSnapshot.bodySource, newSnapshot.bodySource);
  if (body) diff.body = body;
  const categoryName = textDiff(oldSnapshot.categoryName, newSnapshot.categoryName);
  if (categoryName) diff.category = categoryName;
  return diff;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const manifest = loadManifest();
  const { entries, errors } = await source.fetchStrapiCaseStudies();

  if (ONE_SLUG) {
    const entry = entries.find((e) => e.slug === ONE_SLUG);
    if (!entry) {
      console.log(JSON.stringify({ error: `No Strapi entry with slug "${ONE_SLUG}" found.` }, null, 2));
      return;
    }
    const snapshot = source.extractSourceSnapshot(entry);
    const manifestEntry = manifest.stories[ONE_SLUG];

    const shape = (s) => {
      if (!s) return null;
      if (FULL) return s;
      const bodyPreview =
        s.bodySource && s.bodySource.raw.length > 500
          ? s.bodySource.raw.slice(0, 500) + "\n… (truncated — add --full to see the complete body)"
          : s.bodySource?.raw;
      return { ...s, bodySource: { kind: s.bodySource?.kind, raw: bodyPreview } };
    };

    console.log(
      JSON.stringify(
        {
          slug: ONE_SLUG,
          strapiEntryId: entry.id,
          current: shape(snapshot),
          previouslyApproved: shape(manifestEntry ? manifestEntry.sourceSnapshot : null),
          warnings: source.getContentWarnings(entry, snapshot),
        },
        null,
        2
      )
    );
    return;
  }

  const result = { new: [], updated: [], unchanged: [], orphaned: [], errors };
  const seenSlugs = new Set();

  for (const entry of entries) {
    seenSlugs.add(entry.slug);
    const snapshot = source.extractSourceSnapshot(entry);
    const hash = source.computeContentHash(snapshot);
    const manifestEntry = manifest.stories[entry.slug];
    const warnings = source.getContentWarnings(entry, snapshot);

    const summary = {
      slug: entry.slug,
      entryId: entry.id,
      title: snapshot.title,
      category: snapshot.categoryName,
      tags: snapshot.tags,
      heroImageUrl: snapshot.heroImageUrl,
      heroSummary: snapshot.heroSummary,
      metaDescription: snapshot.metaDescription,
      publishDate: snapshot.publishDate,
      warnings,
    };

    if (!manifestEntry) {
      result.new.push(summary);
    } else if (manifestEntry.contentHash !== hash) {
      result.updated.push({
        ...summary,
        previousApprovedAt: manifestEntry.approval?.approvedAt || null,
        diff: buildStoryDiff(manifestEntry.sourceSnapshot, snapshot),
      });
    } else {
      result.unchanged.push({
        slug: entry.slug,
        title: snapshot.title,
        approvedAt: manifestEntry.approval?.approvedAt || null,
      });
    }
  }

  for (const slug of Object.keys(manifest.stories)) {
    if (!seenSlugs.has(slug)) {
      result.orphaned.push({
        slug,
        title: manifest.stories[slug].story?.title || slug,
        approvedAt: manifest.stories[slug].approval?.approvedAt || null,
      });
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
