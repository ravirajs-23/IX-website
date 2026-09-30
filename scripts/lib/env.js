/**
 * Minimal .env loader — no dependency. Real env vars (e.g. from Vercel/shell)
 * always win over anything in .env. Shared by every script that needs
 * STRAPI_URL/STRAPI_API_TOKEN (review, publish, seed) — NOT by
 * build-case-studies.js, which no longer touches Strapi or env vars at all.
 *
 * A line that isn't blank/a comment but has no "=" is malformed (e.g. a
 * missing "=" between a setting name and its value) and can't be safely
 * guessed at — rather than silently ignoring it (which once produced a
 * confusing "STRAPI_API_TOKEN not set" error with no clue why), this stops
 * and reports exactly which file/line is wrong. It never edits the file and
 * never prints the line's full value, in case it's a secret.
 */
const fs = require("fs");
const path = require("path");

class MalformedEnvError extends Error {
  constructor(envPath, badLines) {
    const details = badLines
      .map(({ lineNumber, preview, length }) => `  Line ${lineNumber}: ${preview} (${length} characters total, value hidden for safety)`)
      .join("\n");
    super(
      `Your .env file has a formatting problem — nothing has been changed.\n\n` +
        `  File: ${envPath}\n${details}\n\n` +
        `  Each of these lines is missing the "=" sign between the setting name and its value ` +
        `(it should look like SETTING_NAME=the-actual-value).\n\n` +
        `  Share this exact message with a developer to get it fixed.`
    );
    this.name = "MalformedEnvError";
  }
}

function loadDotEnv(root) {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;

  const badLines = [];
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key && !(key in process.env)) process.env[key] = value;
      return;
    }
    badLines.push({
      lineNumber: i + 1,
      preview: trimmed.length > 30 ? `${trimmed.slice(0, 30)}...` : trimmed,
      length: trimmed.length,
    });
  });

  if (badLines.length) {
    throw new MalformedEnvError(envPath, badLines);
  }
}

/**
 * Same as loadDotEnv, but prints a clean stop message (no stack trace) and
 * exits the process on a MalformedEnvError — every CLI script that reads
 * .env calls this instead of loadDotEnv directly, so "stop with one clear,
 * shareable message" is enforced in one place rather than duplicated.
 */
function loadDotEnvOrExit(root) {
  try {
    loadDotEnv(root);
  } catch (err) {
    if (err instanceof MalformedEnvError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

module.exports = { loadDotEnv, loadDotEnvOrExit, MalformedEnvError };
