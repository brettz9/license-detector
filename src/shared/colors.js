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
