#!/usr/bin/env node
/**
 * build-pages.js
 *
 * Keeps the shared header and footer on the hand-written pages (index.html,
 * about.html, services.html, blog.html, outlook.html, careers.html,
 * contact.html) in sync with the single source of truth:
 *   templates/partials/header.html
 *   templates/partials/footer.html
 *
 * The case-study template (templates/template.html, via
 * build-case-studies.js) reads the exact same two files — so editing
 * either partial and re-running both build scripts updates the nav/footer
 * everywhere at once, instead of hand-editing 7+ files.
 *
 * Each page's header/footer block is wrapped in HTML-comment sentinel
 * markers (inserted automatically the first time this runs) so re-runs
 * are a safe, idempotent replace — never a duplicate insert.
 *
 * Usage: node scripts/build-pages.js   (or: npm run build:pages)
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PARTIALS_DIR = path.join(ROOT, "templates", "partials");

const PAGES = [
  "index.html",
  "about.html",
  "services.html",
  "blog.html",
  "outlook.html",
  "careers.html",
  "contact.html",
];

const BLOCKS = [
  {
    name: "header",
    startMarker: "<!-- SITE-HEADER:START -->",
    endMarker: "<!-- SITE-HEADER:END -->",
    rawTagRe: /<header class="site-header">[\s\S]*?<\/header>/,
  },
  {
    name: "footer",
    startMarker: "<!-- SITE-FOOTER:START -->",
    endMarker: "<!-- SITE-FOOTER:END -->",
    rawTagRe: /<footer class="site-footer">[\s\S]*?<\/footer>/,
  },
];

function loadPartial(filename) {
  return fs.readFileSync(path.join(PARTIALS_DIR, filename), "utf8").trim();
}

/**
 * Replace one block (header or footer) inside `html` with `content`,
 * wrapped in its sentinel markers. If the markers already exist (every
 * run after the first), replace between them. Otherwise, find the raw
 * tag (first run only) and wrap+replace it — self-bootstrapping, no
 * manual one-time edit needed across 7 files.
 */
function replaceBlock(html, block, content) {
  const wrapped = `${block.startMarker}\n${content}\n${block.endMarker}`;
  const sentinelRe = new RegExp(`${block.startMarker}[\\s\\S]*?${block.endMarker}`);

  if (sentinelRe.test(html)) {
    return { html: html.replace(sentinelRe, wrapped), bootstrapped: false };
  }
  if (block.rawTagRe.test(html)) {
    return { html: html.replace(block.rawTagRe, wrapped), bootstrapped: true };
  }
  throw new Error(`Could not find a <${block.name}> block or its sentinel markers to replace.`);
}

function main() {
  const content = {
    header: loadPartial("header.html"),
    footer: loadPartial("footer.html"),
  };

  for (const page of PAGES) {
    const filePath = path.join(ROOT, page);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠ ${page} not found — skipping.`);
      continue;
    }
    let html = fs.readFileSync(filePath, "utf8");
    const notes = [];

    for (const block of BLOCKS) {
      const result = replaceBlock(html, block, content[block.name]);
      html = result.html;
      if (result.bootstrapped) notes.push(`${block.name} sentinels added`);
    }

    fs.writeFileSync(filePath, html, "utf8");
    console.log(`✓ synced ${page}${notes.length ? ` (${notes.join(", ")})` : ""}`);
  }

  console.log("\nDone.");
}

main();
