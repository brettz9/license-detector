#!/usr/bin/env node
/**
 * Copies the classification data shipped by the `license-types` npm package
 * (SPDX identifier -> category map, and category -> color/label map) into
 * `src/data/` as plain JSON files the extension can `fetch()` at runtime.
 * Re-run this (via `npm run build`) after `npm update license-types` to
 * pick up newly-classified licenses.
 */
import {copyFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'src', 'data');

await mkdir(outDir, {recursive: true});

const pkgDir = dirname(require.resolve('license-types/package.json'));

await copyFile(join(pkgDir, 'index.json'), join(outDir, 'license-index.json'));
await copyFile(
  join(pkgDir, 'types.json'), join(outDir, 'license-type-info.json')
);

console.log('Copied license-types data into src/data/');
