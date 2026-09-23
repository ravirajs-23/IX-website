#!/usr/bin/env node
/**
 * seed-case-studies-manifest.js
 *
 * One-time (and emergency-reset) migration: fetches the CURRENT set of
 * Strapi case-story entries + testimonials, and writes
 * data/case-studies-manifest.json treating every entry as already-approved
 * (its current Strapi content becomes the frozen baseline).
 *
 * Run this once, before the manifest-gated build-case-studies.js and the
 * publish-case-studies skill are used for the first time — otherwise every
 * one of today's already-live case studies would show up as "new, pending
 * approval" on day one.
 *
 * Refuses to overwrite an existing manifest (use --force to intentionally
 * reset it) since this is meant to run exactly once per repo.
 *
 * Usage: node scripts/seed-case-studies-manifest.js [--force]
 */
const fs = require("fs");
const path = require("path");
const { loadDotEnv } = require("./lib/env");

const ROOT = path.join(__dirname, "..");
loadDotEnv(ROOT);

const source = require("./lib/case-studies-strapi-source");

const MANIFEST_PATH = path.join(ROOT, "data", "case-studies-manifest.json");
const FORCE = process.argv.includes("--force");

async function main() {
  if (fs.existsSync(MANIFEST_PATH) && !FORCE) {
    console.error(
      `${MANIFEST_PATH} already exists — refusing to overwrite it.\n` +
        `This script is meant to run once, to establish the initial baseline.\n` +
        `If you really want to reset the manifest from Strapi's current state, re-run with --force.`
    );
    process.exit(1);
  }

  console.log("Fetching case-story entries from Strapi…");
  const { entries, errors } = await source.fetchStrapiCaseStudies();
  for (const e of errors) console.warn(`⚠ ${e.message}`);
  console.log(`✓ fetched ${entries.length} case-stor${entries.length === 1 ? "y" : "ies"}`);

  console.log("Fetching testimonials…");
  const testimonials = (await source.fetchAllTestimonials()) || [];
  console.log(`✓ fetched ${testimonials.length} testimonial${testimonials.length === 1 ? "" : "s"}`);

  console.log("Mirroring media…");
  const mediaMirrorMap = await source.mirrorMedia(entries);

  const now = new Date().toISOString();
  const stories = {};
  for (const entry of entries) {
    const story = source.mapStrapiEntryToStory(entry, mediaMirrorMap);
    const sourceSnapshot = source.extractSourceSnapshot(entry);
    stories[entry.slug] = {
      strapiEntryId: entry.id,
      story,
      sourceSnapshot,
      contentHash: source.computeContentHash(sourceSnapshot),
      approval: {
        approvedAt: now,
        approvedBy: "seed-case-studies-manifest.js (baseline import)",
        environment: "production",
        action: "new",
        previousContentHash: null,
      },
    };
  }

  // Sorted keys — minimizes merge-conflict surface on future edits.
  const sortedStories = {};
  for (const slug of Object.keys(stories).sort()) sortedStories[slug] = stories[slug];

  const manifest = {
    schemaVersion: 1,
    generatedAt: now,
    testimonials: { fetchedAt: now, items: testimonials },
    stories: sortedStories,
  };

  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`\n✓ wrote ${MANIFEST_PATH} (${Object.keys(sortedStories).length} stories, pre-approved baseline)`);
  console.log("Next: run `npm run build:case-studies` and confirm it produces no diff vs. the current committed output.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
