#!/usr/bin/env node
/**
 * build-case-studies.js
 *
 * Renders the site's case-study output PURELY from
 * data/case-studies-manifest.json — the frozen, human-approved baseline
 * (see the publish-case-studies skill / scripts/publish-case-studies.js for
 * how stories get into that manifest). This script itself has NO Strapi or
 * network access at all: it's a deterministic `manifest.json -> rendered
 * site` function, which is what keeps the mandatory pre-push hook's rebuild-
 * drift check meaningful, and means the site build can never silently lose
 * content just because Strapi happens to be unreachable.
 *
 * Every run:
 *   1. Reads every approved story from the manifest.
 *   2. Renders case-studies/<slug>.html for each, via templates/template.html.
 *   3. Deletes any case-studies/*.html file whose slug is no longer in the
 *      manifest (keeps the folder from accumulating stale pages if a story
 *      is ever removed from the manifest by hand).
 *   4. Regenerates case-studies.html, sitemap.xml, and the case-studies
 *      block of llms.txt.
 *
 * Usage: node scripts/build-case-studies.js   (or: npm run build:case-studies)
 */
const fs = require("fs");
const path = require("path");
const core = require("./lib/case-studies-core");

const ROOT = path.join(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "data", "case-studies-manifest.json");
const TEMPLATE_PATH = path.join(ROOT, "templates", "template.html");
const PARTIALS_DIR = path.join(ROOT, "templates", "partials");
const OUTPUT_DIR = path.join(ROOT, "case-studies");
const INDEX_OUTPUT_PATH = path.join(ROOT, "case-studies.html");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const LLMS_PATH = path.join(ROOT, "llms.txt");

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(
      `Missing ${MANIFEST_PATH} — run \`node scripts/seed-case-studies-manifest.js\` once ` +
        `(one-time baseline import), or approve at least one story via the publish-case-studies skill.`
    );
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function buildSite() {
  const manifest = loadManifest();
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const partials = {
    header: fs.readFileSync(path.join(PARTIALS_DIR, "header.html"), "utf8").trim(),
    footer: fs.readFileSync(path.join(PARTIALS_DIR, "footer.html"), "utf8").trim(),
  };

  // Secondary sort key (ascending strapiEntryId) matches Strapi's own
  // default fetch order (its unsorted REST list order, ascending by id) —
  // needed because publishDate alone ties for many entries (migrated the
  // same day), and Object.values() here iterates in the manifest's
  // alphabetical-by-slug key order, not Strapi's original order. Without
  // this, same-day entries reorder relative to the original build purely
  // from JSON key order, which is not a real content change but did show up
  // as a full-file diff during verification.
  const stories = Object.values(manifest.stories)
    .sort((a, b) => a.strapiEntryId - b.strapiEntryId)
    .map((e) => e.story)
    .sort((a, b) => (a.publishDate < b.publishDate ? 1 : -1));
  const testimonials = (manifest.testimonials && manifest.testimonials.items) || [];

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const currentSlugs = new Set(stories.map((s) => s.slug));

  for (const story of stories) {
    const html = core.buildDetailPage(story, template, stories, partials, testimonials);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${story.slug}.html`), html, "utf8");
    console.log(`✓ wrote case-studies/${story.slug}.html`);
  }

  for (const file of fs.readdirSync(OUTPUT_DIR)) {
    if (!file.endsWith(".html")) continue;
    const slug = file.slice(0, -".html".length);
    if (!currentSlugs.has(slug)) {
      fs.unlinkSync(path.join(OUTPUT_DIR, file));
      console.log(`✗ removed stale case-studies/${file} (no longer in the manifest)`);
    }
  }

  fs.writeFileSync(INDEX_OUTPUT_PATH, core.buildIndexPage(stories, template, partials), "utf8");
  console.log(`✓ wrote case-studies.html (${stories.length} stor${stories.length === 1 ? "y" : "ies"})`);

  fs.writeFileSync(SITEMAP_PATH, core.buildSitemap(stories), "utf8");
  console.log("✓ updated sitemap.xml");

  core.updateLlmsTxt(stories, LLMS_PATH, fs);
  console.log("✓ updated llms.txt");
}

module.exports = { buildSite };

if (require.main === module) {
  try {
    buildSite();
    console.log("\nDone (from data/case-studies-manifest.json — no Strapi access).");
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
