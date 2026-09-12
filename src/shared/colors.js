/**
 * `license-types`' types.json gives each category a color as either a CSS
 * color keyword (e.g. "pink", "darkgreen") or a bare hex triplet (e.g.
 * "CCCC00", no "#"). Both are used as-is everywhere in this extension's UI
 * so the palette always matches `license-types` directly, rather than
 * maintaining a second hand-picked palette that could drift from it.
 * @param {string} color one entry from a types.json `color` array
 * @returns {string} a valid CSS color
 */
export function toCssColor (color) {
  return (/^[0-9a-f]{6}$/iv).test(color) ? `#${color}` : color;
}

/**
 * `chrome.action.setBadgeBackgroundColor` (unlike every other place this
 * extension uses a color) only accepts a hex/rgba string, not a CSS color
 * keyword like "lightgray" — passing one throws "The color specification
 * could not be parsed." `OffscreenCanvas` is available in a MV3 service
 * worker (no `document`/DOM needed) and its 2D context normalizes any
 * valid CSS color, keyword or not, to `#rrggbb` on read-back, so this
 * covers whatever keywords `license-types` uses now or adds later without
 * a hand-maintained keyword-to-hex table.
 * @param {string} color a CSS color keyword or `toCssColor`-normalized hex
 * @returns {string} a `#rrggbb` hex string
 */
export function toBadgeColor (color) {
  const ctx = new OffscreenCanvas(1, 1).getContext('2d');
  ctx.fillStyle = toCssColor(color);
  return ctx.fillStyle;
}
