# License Detector

A cross-browser Manifest V3 extension that detects the license of the
JavaScript running on a page and classifies it (public domain, permissive,
copyleft, unlabeled, ...), in the spirit of [LibreJS](https://github.com/librejs/librejs)
but implemented independently, from scratch, against public standards, with a
permissive license — no LibreJS code or data is used.

Detection is the primary, always-on feature. Blocking non-free/unlabeled
scripts is optional, off by default, and best-effort on Chrome (MV3 removed
the APIs that would allow anything stronger there).

**Note: This add-on was vibe-coded as a quick experiment done with a minimum of manual review. Use at your own risk. PRs welcome.**

Testing can be done against the [files here](https://brettz9.github.io/license-detector/tests/fixtures/).

## How detection works

Two independent, publicly-documented conventions are recognized in a
script's own text:

1. **[`SPDX-License-Identifier: <expression>`](https://spdx.dev/ids/)** — the
   industry-standard machine-readable license tag used across the open-source
   ecosystem. This is **not** part of GNU/LibreJS's own convention — LibreJS's
   source doesn't recognize it at all — it's an independent, unrelated tag
   this extension additionally checks for, since it's an unambiguous,
   widely-used declaration in its own right.
2. **[GNU's "Free JS Licenses" `@license`/`@licstart`/`@licend` comment
   convention](https://www.gnu.org/licenses/javascript-labels.html)** — the
   convention LibreJS itself implements, and the one that's actually
   *required* for a script to be machine-identifiable by GNU's own spec.
   It's recognized in any of the three forms GNU's guidance documents: a
   standalone `// @license <magnet-link> <name>` ... `// @license-end` tag
   (no wrapper needed); that same tag embedded inside a verbose
   `@licstart ... @licend` block; or, when a `@licstart`/`@licend` block
   carries no tag at all (just the FSF's boilerplate prose, as GNU's own
   librejs pages do for their own inline scripts), the block's own text
   matched against the license-name patterns below.

A page can also declare its scripts' licenses itself via a
**["JavaScript License Web Labels" table](https://www.gnu.org/licenses/javascript-labels.html)**
(`<table id="jslicense-labels1">`), a public convention for site authors —
this extension parses that table if present and uses it as a hint alongside
whatever it finds in the script text.

Whatever identifier is found is classified using
[`license-types`](https://github.com/brettz9/license-types) (SPDX id ->
category, e.g. `permissive`, `weaklyProtective`, `protective`,
`publicDomain`, ...) and colored/labeled using that package's `types.json`.
Run `npm run build:data` (bundled into `npm run build` / `npm install`'s
`prepare` step) to refresh `src/data/*.json` from the installed
`license-types` version after `npm update`.

A script with neither marker is classified `missing` (unlabeled) — trusted
by default for detection, but not counted as "allowed" for blocking unless
you add `missing` to your allowed categories in Options.

### Confident tags vs. best-effort guesses

Not every detection is equally certain. An explicit `SPDX-License-Identifier`
or `@license <magnet-link>` tag is an unambiguous, machine-readable
declaration. But a web-labels table entry, a `@license` tag's trailing
human-readable name, or (especially) a tag-less `@licstart`/`@licend`
block's prose all have to be turned into an SPDX id by
`guessSpdxFromLabel` (`src/background/license-db.js`) matching short
name/URL patterns — a heuristic that can be wrong (see "Limitations"
below). The popup marks any script classified this way with a "best guess,
not a confirmed license tag" note, and Options has a "Block scripts whose
license was only guessed" toggle for treating those as not allowed even
when the guessed category itself would otherwise be.

## How blocking works (optional)

- **Firefox**: if you enable blocking, the options page requests the
  optional `webRequestBlocking` + `webRequestFilterResponse` permissions.
  With those granted, a blocking `webRequest.onBeforeRequest` listener uses
  `filterResponseData` to buffer a script's actual response bytes,
  classify them, and either pass them through unmodified or replace them
  with an empty (syntactically valid) script — before the browser executes
  anything. This is true first-load blocking.
- **Chrome (and any browser without the above)**: there is no MV3 API left
  that can inspect or block a request before it completes, so blocking is
  best-effort via `declarativeNetRequest` dynamic rules. A script's first
  ever load always executes (it has to run before we can classify it), but
  once classified, a persistent rule blocks that exact URL on every future
  request, including the first request of later page loads and tabs.
  Reload the page after a script is newly classified to enforce blocking
  against it.

Which categories count as "allowed" (left alone) vs. blocked is
user-configurable in Options; the default allow-list is `publicDomain`,
`permissive`, and `weaklyProtective`.

Inline `<script>` content is scanned for the SPDX/`@license` markers too,
for reporting purposes, but is never blocked — by the time a content script
observes an inline script it has generally already run.

## Permissions

- `storage` — settings and the classification cache.
- `activeTab` / `tabs` — per-tab badge/icon and popup state.
- `host_permissions` (`http://*/*`, `https://*/*`, `file:///*`) — required
  for the core feature: reading a script's bytes to classify it often means
  fetching it from the background script, which needs host access to do
  cross-origin. `file:///*` extends detection/blocking to scripts loaded
  from local `file://` pages; see the Firefox note below — this access is
  never granted automatically.
- `declarativeNetRequest[Feedback]` — the Chrome-style blocking fallback.
- `webRequest` — observing script requests.
- `webRequestBlocking` / `webRequestFilterResponse` (**optional**, requested
  only if you enable blocking on a browser that supports them) — true
  first-load blocking.

## Development

```sh
npm install     # also runs `npm run build` via the `prepare` script
npm run build   # regenerate src/data/*.json and src/icons/*.png
```

Load unpacked:

- Chrome: `chrome://extensions` -> Developer mode -> **Load unpacked** ->
  select this directory.
- Firefox: `about:debugging#/runtime/this-firefox` -> **Load Temporary
  Add-on** -> select `manifest.json`. Declaring `file:///*` in
  `host_permissions` does **not** grant file access by itself — Firefox
  always keeps it off until you turn it on per-extension: go to
  `about:addons`, open this extension's details, and enable **"Access local
  files on your computer"** under "Permissions and data". Without that
  toggle, scripts on `file://` pages won't be detected or blocked.

Package for distribution:

```sh
npm run zip:chrome
npm run zip:firefox
```

(The manifest itself is the same for both; the two zips differ only in
name — `browser_specific_settings` is simply ignored by Chrome.)

## Limitations

- Classification is a best-effort text scan and a small SPDX-name-guessing
  table for web-labels/prose text (see `src/background/license-db.js`); it
  is not legal advice and can misclassify unusual or obfuscated license
  text. Unlike LibreJS — which matches web-labels links and magnet URIs by
  exact string/hash identity against a curated license database, and
  matches prose only against a complete verbatim canonical sentence per
  license — this table matches on short, potentially ambiguous substrings.
  A known example: the classic GPLv2-or-later notice (with the old FSF
  postal address) can be misclassified as GPL-3.0-or-later, because a
  stray "3" digit inside "02110-1301" satisfies the GPL-3 pattern's
  unanchored wildcard before the GPL-2 pattern is ever tried (see
  `tests/fixtures/licstart-prose-gpl2.html`). This is exactly what the
  guess-vs-confirmed distinction and "block guesses" option above exist to
  let you defend against.
- The classification cache (`chrome.storage.local`) grows as you browse;
  clear it from Options if it gets large or stale.
- Chrome-side blocking cannot prevent a script's very first execution — see
  "How blocking works" above.

## Test fixtures

`tests/fixtures/` has one sample page per detection convention above (SPDX
tag, standalone `@license` tag, tag embedded in `@licstart`/`@licend`,
prose-only `@licstart`/`@licend` for each of GPL-2.0/GPL-3.0/LGPL-3.0/
AGPL-3.0, the web-labels table, an unlabeled baseline, and the
false-positive case from "Limitations" above) — see
`tests/fixtures/README.md` for how to serve them and what each one
demonstrates.

## License

MIT — see [LICENSE-MIT.md](LICENSE-MIT.md).
