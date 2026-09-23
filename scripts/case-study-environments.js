/**
 * Publish targets for the case-study review/publish scripts. Today there's
 * only one (this site has a single Vercel project deploying off `main`) —
 * adding a Staging environment later is just adding an entry here; nothing
 * else in scripts/review-case-studies.js, scripts/publish-case-studies.js,
 * or the publish-case-studies skill needs to change.
 */
module.exports = [
  { id: "production", label: "Production (main)", branch: "main" },
];
