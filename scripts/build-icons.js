#!/usr/bin/env node
/**
 * Generates the toolbar action icons as flat-color PNGs, one per license
 * category (color taken from `license-types`' `types.json`), plus a
 * "neutral" icon shown before a page has been analyzed. No image/canvas
 * dependency: this hand-rolls a minimal RGBA PNG encoder (a filled circle
 * on a transparent background) since the icons are intentionally simple
 * placeholders that downstream users can replace with real artwork.
 */
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import colorNameToRgb from 'color-name';
import {toCssColor} from '../src/shared/colors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'data');
const outDir = join(__dirname, '..', 'src', 'icons');
const sizes = [16, 32, 48, 128];

// Node has no DOM/canvas to resolve CSS color keywords itself, so keyword
// -> RGB comes from the `color-name` package (the canonical CSS-keyword
// table, also what libraries like `chalk`/`color-convert` rely on) rather
// than a hand-picked approximation.
/**
 * @param {string} color a CSS color keyword or `#rrggbb` hex string
 * @returns {{r: number, g: number, b: number}}
 */
function toRgb (color) {
  const css = toCssColor(color);
  if (css.startsWith('#')) {
    const hex = css.slice(1);
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16)
    };
  }
  const [r, g, b] = colorNameToRgb[css] ?? colorNameToRgb.gray;
  return {r, g, b};
}

/* eslint-disable no-bitwise -- CRC32 is inherently bitwise arithmetic. */
/**
 * @param {Buffer} buf
 * @returns {number} the buffer's CRC32 checksum
 */
function crc32 (buf) {
  let c;
  const table = (crc32.table ??= (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xFFFFFFFF;
  for (const byte of buf) {
    crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
/* eslint-enable no-bitwise -- CRC32 is inherently bitwise arithmetic. */

/**
 * @param {string} type a 4-character PNG chunk type, e.g. "IHDR"
 * @param {Buffer} data
 * @returns {Buffer} the length-prefixed, CRC-suffixed chunk
 */
function chunk (type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Encodes a filled circle of `rgb` on a transparent background as a PNG.
 * @param {number} size width/height of the (square) icon, in pixels
 * @param {{r: number, g: number, b: number}} rgb
 * @returns {Buffer} a complete PNG file
 */
function encodeCirclePng (size, {r, g, b}) {
  const radius = (size / 2) - Math.max(1, size * 0.06);
  const cx = (size / 2) - 0.5;
  const cy = (size / 2) - 0.5;
  const raw = Buffer.alloc(size * (1 + (size * 4)));
  let pos = 0;
  for (let y = 0; y < size; y++) {
    raw[pos++] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      // Antialias the edge over ~1px for a less jagged small icon.
      const alpha = Math.max(0, Math.min(1, radius - dist + 0.5));
      raw[pos++] = r;
      raw[pos++] = g;
      raw[pos++] = b;
      raw[pos++] = Math.round(alpha * 255);
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * Generates and writes every size of every category's icon PNG.
 * @returns {Promise<void>}
 */
async function main () {
  await mkdir(outDir, {recursive: true});

  const typeInfoPath = join(dataDir, 'license-type-info.json');
  const typeInfo = JSON.parse(await readFile(typeInfoPath, 'utf8'));
  const palette = {neutral: '#9e9e9e', ...Object.fromEntries(
    Object.entries(typeInfo).map(([category, {color}]) => [category, color[0]])
  )};

  await Promise.all(Object.entries(palette).flatMap(([category, color]) => {
    const rgb = toRgb(color);
    return sizes.map(async (size) => {
      const png = encodeCirclePng(size, rgb);
      await writeFile(join(outDir, `icon-${category}-${size}.png`), png);
    });
  }));

  console.log(`Generated ${Object.keys(palette).length * sizes.length} icon PNGs in src/icons/`);
}

await main();
