/**
 * Wraps the data shipped by the `license-types` npm package (copied into
 * src/data/ at build time by scripts/build-license-data.js) and adds a
 * small independent mapping from the license names/URLs commonly used in
 * GNU "JavaScript License Web Labels" tables to SPDX identifiers, since
 * that table format identifies licenses by name/link rather than by SPDX
 * id. This mapping is our own approximation, not part of any upstream
 * project's data.
 */

const cache = {indexPromise: undefined, typeInfoPromise: undefined};

/**
 * @param {string} path
 * @returns {Promise<object>} the parsed JSON at `path`
 */
async function load (path) {
  const res = await fetch(chrome.runtime.getURL(path));
  return res.json();
}

/**
 * @returns {Promise<Object<string, Object<string, boolean>>>} SPDX id ->
 *   category flags
 */
export function getLicenseIndex () {
  cache.indexPromise ??= load('src/data/license-index.json');
  return cache.indexPromise;
}

/**
 * @returns {Promise<Object<string, {color: string[], text: string}>>}
 *   category -> display info
 */
export function getLicenseTypeInfo () {
  cache.typeInfoPromise ??= load('src/data/license-type-info.json');
  return cache.typeInfoPromise;
}

// Ordered worst-to-best for picking the "dominant" category of a page with
// multiple scripts (mirrors the intent of types.json's color scale: the
// more restrictive/uncertain a category, the more prominently it should be
// surfaced to the user).
export const CATEGORY_SEVERITY = [
  'missing',
  'uncategorized',
  'unlicensed',
  'custom',
  'modifyProtective',
  'useProtective',
  'networkProtective',
  'protective',
  'weaklyProtective',
  'permissive',
  'publicDomain'
];

/**
 * Common license names/URLs as they tend to appear in a page's
 * `#jslicense-labels1` table, mapped to an SPDX identifier. Not exhaustive;
 * anything unrecognized falls through to "custom".
 */
const NAME_TO_SPDX = [
  [/expat|mit license/iv, 'MIT'],
  [/apache.*2\.0/iv, 'Apache-2.0'],
  [/gnu general public license.*v?3/iv, 'GPL-3.0-or-later'],
  [/gnu general public license.*v?2/iv, 'GPL-2.0-or-later'],
  [/gnu affero general public license.*v?3/iv, 'AGPL-3.0-or-later'],
  [/gnu lesser general public license.*v?3/iv, 'LGPL-3.0-or-later'],
  [/gnu lesser general public license.*v?2\.1/iv, 'LGPL-2.1-or-later'],
  // The abbreviated filenames used by the FSF's own canonical
  // "magnet:...&dn=<name>.txt" license links (the GNU "Free JS Licenses"
  // guidance's documented `@license <magnet-link> <name>` tag), as opposed
  // to the spelled-out license names above from web-labels table links.
  // agpl/lgpl must be checked before the plain gpl patterns below, since
  // "agpl-3.0"/"lgpl-3.0" both contain "gpl-3.0" as a substring.
  [/agpl-3\.0|agpl-v?3\b/iv, 'AGPL-3.0-or-later'],
  [/lgpl-3\.0|lgpl-v?3\b/iv, 'LGPL-3.0-or-later'],
  [/lgpl-2\.1/iv, 'LGPL-2.1-or-later'],
  [/gpl-3\.0|gpl-v?3\b/iv, 'GPL-3.0-or-later'],
  [/gpl-2\.0|gpl-v?2\b/iv, 'GPL-2.0-or-later'],
  [/mozilla public license.*2\.0/iv, 'MPL-2.0'],
  [/bsd.*3.clause|new bsd|modified bsd/iv, 'BSD-3-Clause'],
  [/bsd.*2.clause|simplified bsd/iv, 'BSD-2-Clause'],
  [/isc license/iv, 'ISC'],
  [/creative commons.*cc0|public domain|\bcc0\b/iv, 'CC0-1.0'],
  [/unlicense(?!d)/iv, 'Unlicense'],
  [/x11 license|\bx11\b/iv, 'MIT']
];

/**
 * `entry.source` values that come from `guessSpdxFromLabel`'s fuzzy
 * name/text pattern matching, as opposed to an unambiguous, explicit
 * machine-readable declaration (`SPDX-License-Identifier:`). Unlike
 * LibreJS — which matches web-labels links and magnet URIs by exact
 * string/hash identity against a curated license database, and matches
 * prose notices only against a complete verbatim canonical sentence per
 * license — this pattern table matches on short, potentially ambiguous
 * substrings, so these results can be wrong and the UI should mark them
 * as guesses rather than certain identifications.
 * @type {Set<string>}
 */
export const GUESSED_SOURCES = new Set([
  'web-labels-table', 'in-script-license-url', 'in-script-license-text'
]);

/**
 * Whether `entry` falls outside the user's allowed categories — either
 * because its category isn't allowed, or (when `settings.blockGuesses`
 * is on) because its category came from a guess rather than a confirmed
 * tag. This is the "flagged" concept shown in the badge count and popup
 * summary; it's independent of `settings.blockingEnabled`; combine with
 * that separately for an actual block decision.
 * @param {{allowedCategories: string[], blockGuesses: boolean}} settings
 * @param {{category: string, source: string}} entry
 * @returns {boolean}
 */
export function isFlagged (settings, entry) {
  if (settings.blockGuesses && GUESSED_SOURCES.has(entry.source)) {
    return true;
  }
  return !settings.allowedCategories.includes(entry.category);
}

/**
 * @param {string} nameOrUrl Text or href from a web-labels license cell
 * @returns {string|null} A best-guess SPDX identifier, or null if unrecognized
 */
export function guessSpdxFromLabel (nameOrUrl) {
  if (!nameOrUrl) {
    return null;
  }
  for (const [pattern, spdx] of NAME_TO_SPDX) {
    if (pattern.test(nameOrUrl)) {
      return spdx;
    }
  }
  return null;
}

/**
 * Classifies a normalized SPDX identifier (or best-guess name) into one of
 * `license-types`' categories.
 * @param {string|null} spdxId
 * @returns {Promise<string>} category name, e.g. "permissive", "missing"
 */
export async function classify (spdxId) {
  if (!spdxId) {
    return 'missing';
  }
  const index = await getLicenseIndex();
  // Try the id as-is, then strip common "-or-later"/"-only" SPDX suffixes,
  // then try the first branch of an "A OR B" expression.
  const candidates = [
    spdxId,
    spdxId.replace(/-(?:or-later|only)$/v, ''),
    spdxId.split(/\s+OR\s+/iv, 1)[0]
  ];
  for (const candidate of candidates) {
    const info = index[candidate];
    if (info) {
      const [category] = Object.keys(info);
      return category;
    }
  }
  return 'uncategorized';
}

/**
 * @param {string[]} categories
 * @returns {string} the most severe (least free/most uncertain) category
 *   present
 */
export function dominantCategory (categories) {
  if (categories.length === 0) {
    return 'missing';
  }
  let worst = categories[0];
  let worstRank = CATEGORY_SEVERITY.indexOf(worst);
  for (const category of categories) {
    const rank = CATEGORY_SEVERITY.indexOf(category);
    if (rank < worstRank) {
      worst = category;
      worstRank = rank;
    }
  }
  return worst;
}
