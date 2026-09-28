#!/usr/bin/env node
/**
 * build-events.js
 *
 * Regenerates the derived parts of events.html (hero stats, filter-pill
 * counts, event card list) from data/events-source.json — the single
 * source of truth for event content. Marketing publishes a new event by
 * editing that file (directly, or via the publish-events skill); this
 * script turns it into the actual page. Zero network access.
 *
 * Each derived region is wrapped in HTML-comment sentinel markers so
 * re-runs are a safe, idempotent replace.
 *
 * Usage: node scripts/build-events.js   (or: npm run build:events)
 */

const fs = require("fs");
const path = require("path");
const { getEventWarnings, renderStats, renderFilters, renderList } = require("./lib/events-core");

const ROOT = path.join(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data", "events-source.json");
const PAGE_PATH = path.join(ROOT, "events.html");

const REGIONS = [
  { name: "stats", startMarker: "<!-- EVENTS-STATS:START -->", endMarker: "<!-- EVENTS-STATS:END -->", render: renderStats },
  { name: "filters", startMarker: "<!-- EVENTS-FILTERS:START -->", endMarker: "<!-- EVENTS-FILTERS:END -->", render: renderFilters },
  { name: "list", startMarker: "<!-- EVENTS-LIST:START -->", endMarker: "<!-- EVENTS-LIST:END -->", render: renderList },
];

/**
 * Replace one sentinel-wrapped region in `html` with `content`. events.html
 * already carries all three sentinel pairs (added once, by hand, when this
 * pipeline was set up) — unlike build-pages.js's header/footer sync, there's
 * no "raw tag" bootstrap path here: the regions are nested <div>s that a
 * simple regex can't safely locate on its own, so sentinels are required.
 */
function replaceRegion(html, region, content) {
  const wrapped = `${region.startMarker}\n${content}\n      ${region.endMarker}`;
  const sentinelRe = new RegExp(`${region.startMarker}[\\s\\S]*?${region.endMarker}`);
  if (!sentinelRe.test(html)) {
    throw new Error(`Could not find sentinel markers for the "${region.name}" region in events.html.`);
  }
  return html.replace(sentinelRe, wrapped);
}

function buildEvents() {
  const events = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

  const warnings = events.flatMap((event, i) => getEventWarnings(event, i));
  if (warnings.length) {
    console.log("Content warnings (advisory only):");
    warnings.forEach((w) => console.log(`  - ${w}`));
  }

  let html = fs.readFileSync(PAGE_PATH, "utf8");
  for (const region of REGIONS) {
    html = replaceRegion(html, region, region.render(events));
  }

  fs.writeFileSync(PAGE_PATH, html, "utf8");
  console.log(`✓ synced events.html from events-source.json (${events.length} events)`);
}

module.exports = { buildEvents };

if (require.main === module) {
  buildEvents();
}
