#!/usr/bin/env node
/**
 * publish-case-studies.js
 *
 * Takes a human-approved list of slugs and actually publishes them: re-fetches
 * Strapi fresh (never trusts the earlier review's possibly-stale view),
 * mirrors media for just those slugs, freezes each into
 * data/case-studies-manifest.json, refreshes the testimonials snapshot, then
 * regenerates the site (via build-case-studies.js's buildSite()) and
 * `git add`s exactly the changed paths.
 *
 * Deliberately does NOT `git commit` or `git push` — that's the actual
 * "go live" action and stays a separate, explicit, visible step (see the
 * publish-case-studies skill), never hidden inside a script.
 *
 * Usage:
 *   node scripts/publish-case-studies.js --slugs=slug-a,slug-b --env=production --approved-by="name"
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { loadDotEnv } = require("./lib/env");

const ROOT = path.join(__dirname, "..");
loadDotEnv(ROOT);

const source = require("./lib/case-studies-strapi-source");
const environments = require("./case-study-environments");
const { buildSite } = require("./build-case-studies");

const MANIFEST_PATH = path.join(ROOT, "data", "case-studies-manifest.json");

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (prefix) => {
    const a = args.find((x) => x.startsWith(prefix));
    return a ? a.slice(prefix.length) : null;
  };
  const slugsArg = get("--slugs=");
  const envId = get("--env=");
  const approvedBy = get("--approved-by=") || "unknown";
  if (!slugsArg) throw new Error("Missing --slugs=<comma,separated,slugs>");
  if (!envId) throw new Error("Missing --env=<environment id> (see scripts/case-study-environments.js)");
  const environment = environments.find((e) => e.id === envId);
  if (!environment) {
    throw new Error(
      `Unknown environment "${envId}". Known: ${environments.map((e) => e.id).join(", ")}`
    );
  }
  const slugs = [...new Set(slugsArg.split(",").map((s) => s.trim()).filter(Boolean))];
  if (!slugs.length) throw new Error("--slugs was empty after parsing.");
  return { slugs, environment, approvedBy };
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(
      `Missing ${MANIFEST_PATH} — run \`node scripts/seed-case-studies-manifest.js\` once first.`
    );
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function writeManifest(manifest) {
  const sortedStories = {};
  for (const slug of Object.keys(manifest.stories).sort()) sortedStories[slug] = manifest.stories[slug];
  manifest.stories = sortedStories;
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

async function main() {
  const { slugs, environment, approvedBy } = parseArgs();
  const manifest = loadManifest();

  console.log(`Fetching current Strapi entries to re-validate ${slugs.length} requested slug(s)…`);
  const { entries } = await source.fetchStrapiCaseStudies();
  const entryBySlug = new Map(entries.map((e) => [e.slug, e]));

  const toPublish = [];
  const skipped = [];

  for (const slug of slugs) {
    const entry = entryBySlug.get(slug);
    if (!entry) {
      skipped.push({ slug, reason: "No longer present in Strapi (removed/renamed since it was reviewed)." });
      continue;
    }
    const snapshot = source.extractSourceSnapshot(entry);
    const hash = source.computeContentHash(snapshot);
    const existing = manifest.stories[slug];
    if (existing && existing.contentHash === hash) {
      skipped.push({ slug, reason: "Already matches the currently-approved content — nothing to do (someone may have already published this)." });
      continue;
    }
    toPublish.push({ slug, entry, snapshot, hash, existing });
  }

  if (!toPublish.length) {
    console.log("Nothing to publish.");
    if (skipped.length) console.log("Skipped:\n" + skipped.map((s) => `  - ${s.slug}: ${s.reason}`).join("\n"));
    return;
  }

  console.log(`Mirroring media for ${toPublish.length} stor${toPublish.length === 1 ? "y" : "ies"}…`);
  const mediaMirrorMap = await source.mirrorMedia(toPublish.map((s) => s.entry));

  const now = new Date().toISOString();
  for (const { slug, entry, snapshot, hash, existing } of toPublish) {
    const story = source.mapStrapiEntryToStory(entry, mediaMirrorMap);
    manifest.stories[slug] = {
      strapiEntryId: entry.id,
      story,
      sourceSnapshot: snapshot,
      contentHash: hash,
      approval: {
        approvedAt: now,
        approvedBy,
        environment: environment.id,
        action: existing ? "update" : "new",
        previousContentHash: existing ? existing.contentHash : null,
      },
    };
    console.log(`✓ ${existing ? "updated" : "added"} manifest entry for "${slug}"`);
  }

  console.log("Refreshing testimonials snapshot…");
  const testimonials = await source.fetchAllTestimonials();
  if (testimonials) {
    manifest.testimonials = { fetchedAt: now, items: testimonials };
  } else {
    console.log("  (Strapi testimonials fetch failed — keeping the previous snapshot.)");
  }

  manifest.generatedAt = now;
  writeManifest(manifest);

  console.log("Regenerating site output from the updated manifest…");
  buildSite();

  const pathsToStage = [
    "data/case-studies-manifest.json",
    "case-studies",
    "case-studies.html",
    "sitemap.xml",
    "llms.txt",
    "images/case-studies/strapi",
  ];
  git(["add", ...pathsToStage]);

  console.log(
    `\n✓ Staged ${toPublish.length} stor${toPublish.length === 1 ? "y" : "ies"} for "${environment.label}": ` +
      toPublish.map((s) => s.slug).join(", ")
  );
  if (skipped.length) {
    console.log("Skipped:\n" + skipped.map((s) => `  - ${s.slug}: ${s.reason}`).join("\n"));
  }
  console.log("\nNOT committed or pushed yet — review `git diff --cached --stat`, then commit and push explicitly.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
