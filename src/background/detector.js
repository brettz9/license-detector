/**
 * Extracts a license identifier from a piece of JavaScript source text.
 *
 * Three independent, publicly-documented conventions are recognized, in
 * order of preference:
 *
 * 1. The SPDX "SPDX-License-Identifier: <expression>" comment convention
 *    (https://spdx.dev/ids/) — an industry-standard machine-readable tag
 *    used across countless open-source projects, unrelated to any single
 *    browser extension.
 * 2. A standalone `// @license <magnet-link> <name>` / `// @license-end`
 *    tag, the convention documented by the GNU "Free JS Licenses" web-labels
 *    guidance (https://www.gnu.org/licenses/javascript-labels.html) for
 *    identifying a script's license from within the script itself when a
 *    page-level web-labels table isn't available. This tag is *not*
 *    required to sit inside a `@licstart ... @licend` block — the same
 *    guidance documents it as a lighter-weight alternative to one, and it
 *    routinely appears on its own (e.g. Google's `prettify.js`, as loaded
 *    by GNU's own librejs pages).
 * 3. A `@licstart ... @licend` block with no machine-readable tag inside
 *    it at all — just the verbatim FSF license boilerplate prose (this is
 *    in fact how GNU's own librejs "free-your-javascript.html" page labels
 *    its own inline script). The block's whitespace-normalized text is
 *    matched against the same license-name patterns `guessSpdxFromLabel`
 *    uses for web-labels table text, since it's exactly that: a
 *    human-readable license name/description, just embedded in a comment
 *    instead of an HTML link.
 *
 * None of these is LibreJS source code: they are open, independently
 * documented text conventions that any tool is free to implement.
 */

const SPDX_TAG = /SPDX-License-Identifier:\s*(?<id>[^\r\n*]+)/iv;
const LICENSE_TAG = /@license\s+(?<url>\S+)/iv;
const LICSTART_BLOCK = /@licstart(?<body>[\s\S]*?)@licend/iv;

/**
 * @param {string} source
 * @returns {{spdxId: string|null, licenseUrl: string|null,
 *   licenseText: string|null}}
 */
export function detectFromSource (source) {
  const spdxMatch = SPDX_TAG.exec(source);
  if (spdxMatch) {
    return {
      spdxId: spdxMatch.groups.id.trim(), licenseUrl: null, licenseText: null
    };
  }

  const tagMatch = LICENSE_TAG.exec(source);
  if (tagMatch) {
    return {
      spdxId: null, licenseUrl: tagMatch.groups.url.trim(), licenseText: null
    };
  }

  const block = LICSTART_BLOCK.exec(source);
  if (block) {
    // Strip each line's leading `*` comment-continuation marker before
    // joining, or e.g. "the GNU\n * General Public License" would collapse
    // to "the gnu * general public license" — the stray `*` breaking up
    // the very phrase `guessSpdxFromLabel` needs to match intact.
    const licenseText = block.groups.body.
      split('\n').
      map((line) => line.replace(/^\s*\*+\s?/v, '').trim()).
      join(' ').
      replaceAll(/\s+/gv, ' ').
      trim();
    return {spdxId: null, licenseUrl: null, licenseText};
  }

  return {spdxId: null, licenseUrl: null, licenseText: null};
}
