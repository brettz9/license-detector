#!/usr/bin/env node
/**
 * Packages the extension into dist/license-detector-<target>.zip for
 * loading unpacked or uploading to a store. `target` is only used to name
 * the file: the manifest itself works unmodified in both browsers (Chrome
 * ignores `browser_specific_settings`; Firefox ignores the `scripts`/`type`
 * background keys it doesn't need once `service_worker` is supported).
 */
import archiver from 'archiver';
import {createWriteStream, existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const target = process.argv[2] ?? 'chrome';
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'dist');

const requiredFiles = [
  'src/data/license-index.json', 'src/icons/icon-neutral-16.png'
];
for (const required of requiredFiles) {
  if (existsSync(join(root, required))) {
    continue;
  }

  console.error(`Missing ${required} — run \`npm run build\` first.`);
  process.exit(1);
}

await mkdir(distDir, {recursive: true});
const outPath = join(distDir, `license-detector-${target}.zip`);
const output = createWriteStream(outPath);
const archive = archiver('zip', {zlib: {level: 9}});

archive.pipe(output);
archive.file(join(root, 'manifest.json'), {name: 'manifest.json'});
archive.directory(join(root, 'src'), 'src');

output.on('close', () => {
  console.log(`Wrote ${outPath} (${archive.pointer()} bytes)`);
});

await archive.finalize();
