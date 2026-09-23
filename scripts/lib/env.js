/**
 * Minimal .env loader — no dependency. Real env vars (e.g. from Vercel/shell)
 * always win over anything in .env. Shared by every script that needs
 * STRAPI_URL/STRAPI_API_TOKEN (review, publish, seed) — NOT by
 * build-case-studies.js, which no longer touches Strapi or env vars at all.
 */
const fs = require("fs");
const path = require("path");

function loadDotEnv(root) {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

module.exports = { loadDotEnv };
