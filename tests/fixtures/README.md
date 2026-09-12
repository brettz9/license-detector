# Test fixtures

Manual test pages, one per license-declaration convention the detector in
`src/background/detector.js` and `src/background/license-db.js`
recognizes. Start at [index.html](index.html) for the full list with
expected results.

## Serving these pages

The content script only runs on pages matching `manifest.json`'s
`content_scripts` patterns (`http://*/*`, `https://*/*`, `file:///*`), so
either serve this directory over HTTP or use `file://` directly — but
`file://` access is off by default per-extension and has to be turned on
manually in the browser, regardless of what `manifest.json` declares:

- **Chrome**: `chrome://extensions` → License Detector → Details → enable
  "Allow access to file URLs".
- **Firefox 153+**: the extension's permissions settings → enable "Access
  local files on your computer" (this was previously bundled into "Access
  your data for all websites" on older Firefox; 153 made it a separate,
  off-by-default permission).

Either way, **reload any already-open fixture tab** after flipping the
toggle — permission changes don't retroactively apply to a tab that was
already loaded before you granted them.

To serve over HTTP instead (no toggle needed), from the repo root:

```sh
npx http-server tests/fixtures -p 8089
# or: python3 -m http.server 8089 --directory tests/fixtures
```

then open `http://localhost:8089/`.

## SPDX tag vs. GNU's `@license` convention

Two unrelated conventions are recognized, and it's worth being clear
they're not part of the same spec:

- **`SPDX-License-Identifier: <expression>`** is *not* part of GNU/LibreJS's
  convention at all — LibreJS's own source doesn't recognize it. It's this
  extension's own addition, since it's a separate, industry-standard,
  unambiguous, machine-readable tag used widely in its own right.
- **`@license`/`@licstart`/`@licend`** (in any of the three forms
  documented at
  [gnu.org/licenses/javascript-labels.html](https://www.gnu.org/licenses/javascript-labels.html))
  is the convention GNU/LibreJS's spec actually defines, and the one
  LibreJS itself implements.

The `spdx-*` fixtures test the former; every other fixture tests some
form of the latter (a standalone tag, a tag embedded in a
`@licstart`/`@licend` block, or a tag-less block matched by its prose).

## Troubleshooting: a fixture shows the wrong result

External-script fixtures are cached by URL in `chrome.storage.local`
(`classifyExternalScript` in `background.js` only computes a fresh result
`if (!entry)`). If you test a fixture, then a later code change would have
classified it differently, reloading the extension and the page still
replays the *old* cached result — the cache doesn't know anything
changed. Options → "Clear cached classifications" forces a recompute.
(Editing `background.js` also needs the extension itself reloaded from
`about:debugging`/`chrome://extensions`, not just the test page, to pick
up the new code at all — check that too if something seems stuck.)

## Confirmed tags vs. best-effort guesses

Only an explicit `SPDX-License-Identifier` or `@license <magnet-link>` tag
is unambiguous. Everything else — a web-labels table entry, a `@license`
tag's trailing human-readable name, or a tag-less `@licstart`/`@licend`
block's prose — has to be turned into an SPDX id by
`guessSpdxFromLabel`'s short-pattern matching, which can be wrong. The
`⚠️`-marked fixtures in `index.html` are known, verified false positives
from that matching — kept here specifically so a future fix to those
patterns can be checked against a real notice rather than a synthetic one.
