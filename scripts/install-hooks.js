#!/usr/bin/env node
/**
 * install-hooks.js
 *
 * Copies scripts/hooks/* into .git/hooks/ and marks them executable.
 * .git/hooks isn't tracked by git, so this is what actually makes the
 * pre-push style-diff check apply on a given clone — run automatically via
 * the "postinstall" npm script (so `npm install` re-establishes it after a
 * fresh clone or a `.git` directory that got reset), or by hand:
 *   node scripts/install-hooks.js
 *
 * Never overwrites a hook that wasn't installed by this script (checks for
 * the marker comment first) — so it won't clobber a hook you or another
 * tool set up on purpose.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const MARKER = "# Installed by scripts/install-hooks.js";

function main() {
  let gitDir;
  try {
    gitDir = execSync("git rev-parse --git-dir", { encoding: "utf8" }).trim();
  } catch {
    console.log("Not a git repository (or git isn't on PATH) — skipping hook install.");
    return;
  }

  const hooksSrcDir = path.join(__dirname, "hooks");
  const hooksDestDir = path.join(gitDir, "hooks");
  if (!fs.existsSync(hooksSrcDir)) return;
  fs.mkdirSync(hooksDestDir, { recursive: true });

  for (const file of fs.readdirSync(hooksSrcDir)) {
    const src = path.join(hooksSrcDir, file);
    const dest = path.join(hooksDestDir, file);

    if (fs.existsSync(dest)) {
      const existing = fs.readFileSync(dest, "utf8");
      if (!existing.includes(MARKER)) {
        console.warn(
          `⚠ .git/hooks/${file} already exists and wasn't installed by this script — leaving it alone. ` +
            `Merge scripts/hooks/${file} into it by hand if you want the style-diff check too.`
        );
        continue;
      }
    }

    fs.copyFileSync(src, dest);
    try {
      fs.chmodSync(dest, 0o755);
    } catch {
      // chmod is a no-op on some Windows filesystems — fine, Git for
      // Windows' bundled bash runs hooks via the shebang regardless.
    }
    console.log(`✓ installed .git/hooks/${file}`);
  }
}

main();
