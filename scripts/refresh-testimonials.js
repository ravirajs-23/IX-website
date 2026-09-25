#!/usr/bin/env node
/**
 * refresh-testimonials.js
 *
 * Updates the sitewide testimonials carousel (shown identically on every
 * case-study page) from whichever Strapi is currently configured in .env.
 *
 * Deliberately its own separate script, run only when someone actually wants
 * to update testimonials — NOT a side effect of publish-case-studies.js.
 * Testimonials are a single sitewide value shared across all 100+
 * case-study pages, so trusting whatever Strapi happens to be configured at
 * the moment of an unrelated case-study approval is dangerous: pointing at
 * a near-empty local/test Strapi instance while approving a couple of test
 * case studies would otherwise silently blow away the real testimonials on
 * every live page with a handful of test entries — this happened for real
 * during testing before this was split out.
 *
 * Same pattern as publish-case-studies.js: updates the manifest, rebuilds
 * the site, and `git add`s the result — does NOT commit or push. Review the
 * diff (`git diff --cached --stat`) before committing, the same as any
 * other publish.
 *
 * Usage: node scripts/refresh-testimonials.js
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { loadDotEnv } = require("./lib/env");

const ROOT = path.join(__dirname, "..");
loadDotEnv(ROOT);

const source = require("./lib/case-studies-strapi-source");
const { buildSite } = require("./build-case-studies");
const { buildServices } = require("./build-services");

const MANIFEST_PATH = path.join(ROOT, "data", "case-studies-manifest.json");

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing ${MANIFEST_PATH} — run scripts/seed-case-studies-manifest.js once first.`);
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

async function main() {
  const manifest = loadManifest();

  console.log("Fetching testimonials from Strapi…");
  const testimonials = await source.fetchAllTestimonials();
  if (!testimonials) {
    throw new Error("Could not fetch testimonials from Strapi — check STRAPI_URL/STRAPI_API_TOKEN in .env.");
  }

  const previousCount = ((manifest.testimonials && manifest.testimonials.items) || []).length;
  console.log(`Fetched ${testimonials.length} testimonial${testimonials.length === 1 ? "" : "s"} (previously ${previousCount}).`);

  if (testimonials.length === 0) {
    throw new Error(
      "Strapi returned zero testimonials — refusing to overwrite the existing sitewide carousel with an empty list. " +
        "If this is genuinely correct, edit data/case-studies-manifest.json's testimonials.items directly instead."
    );
  }

  manifest.testimonials = { fetchedAt: new Date().toISOString(), items: testimonials };
  manifest.generatedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log("Regenerating site output (testimonials appear on every case-study page)…");
  buildSite();
  // buildSite()'s buildSitemap() rewrites sitemap.xml from scratch, which
  // drops the services block build-services.js appends — re-run it so
  // sitemap.xml matches what a full `npm run build` produces (otherwise the
  // pre-push hook's rebuild-drift check fails).
  buildServices();

  execFileSync(
    "git",
    ["add", "data/case-studies-manifest.json", "case-studies", "case-studies.html", "llms.txt", "sitemap.xml"],
    { cwd: ROOT }
  );

  const storyCount = Object.keys(manifest.stories).length;
  console.log(
    `\n✓ Staged updated testimonials (${previousCount} → ${testimonials.length}) and ${storyCount} regenerated case-study page${storyCount === 1 ? "" : "s"}.`
  );
  console.log("NOT committed or pushed yet — review `git diff --cached --stat`, then commit and push explicitly.");
}

// Guarded so `require`-ing this module can never trigger a real refresh as a
// side effect. Only runs when invoked directly.
if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
