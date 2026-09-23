/**
 * Stable-key-order JSON stringify, used only for content hashing
 * (scripts/lib/case-studies-strapi-source.js's computeContentHash) so a
 * hash never spuriously changes just because two identical objects had
 * their keys in a different order.
 */
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = sortKeysDeep(value[key]);
    return sorted;
  }
  return value;
}

function canonicalStringify(obj) {
  return JSON.stringify(sortKeysDeep(obj));
}

module.exports = { canonicalStringify, sortKeysDeep };
