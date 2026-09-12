/**
 * Runs in every page. Collects the page's external and inline <script>
 * tags, plus the GNU "JavaScript License Web Labels" table if the page
 * provides one (a public convention for site authors to declare each
 * script's license; see https://www.gnu.org/licenses/javascript-labels.html),
 * and reports them to the background script for classification.
 */

/**
 * Parses a `#jslicense-labels1` table, if present, into
 * `{ [scriptUrl]: {text, href} }`. The table's documented shape is one row
 * per script: a link to the script, a link to its license, and a link to
 * its source.
 * @returns {Object<string, {text: string, href: string}>}
 */
function parseWebLabelsTable () {
  const table = document.querySelector('#jslicense-labels1');
  if (!table) {
    return {};
  }

  const labels = {};
  for (const row of table.querySelectorAll('tr')) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) {
      continue;
    }
    const scriptLink = cells[0].querySelector('a');
    const licenseLink = cells[1].querySelector('a');
    if (!scriptLink || !licenseLink) {
      continue;
    }
    const scriptUrl = new URL(
      scriptLink.getAttribute('href'), document.baseURI
    ).href;
    labels[scriptUrl] = {
      text: licenseLink.textContent.trim(),
      href: licenseLink.getAttribute('href')
    };
  }
  return labels;
}

/**
 * @returns {Array<{src: string, inline: false}|
 *   {index: number, inline: true, text: string}>}
 */
function collectScripts () {
  const scripts = [];
  document.querySelectorAll('script').forEach((el, index) => {
    if (el.src) {
      scripts.push({
        src: new URL(el.src, document.baseURI).href, inline: false
      });
    } else if (el.textContent.trim()) {
      scripts.push({index, inline: true, text: el.textContent});
    }
  });
  return scripts;
}

/**
 * Sends the page's scripts to the background script for classification.
 * Fire-and-forget: this file runs as a classic (non-module) content script,
 * so it can't use top-level `await`.
 * @param {Array<object>} scripts
 * @returns {Promise<void>}
 */
async function sendReport (scripts) {
  try {
    await chrome.runtime.sendMessage({
      type: 'PAGE_SCRIPTS',
      pageUrl: location.href,
      scripts,
      webLabels: parseWebLabelsTable()
    });
  } catch {
    // Background may not be ready yet (e.g. right after install); the next
    // mutation-triggered report will retry.
  }
}

/**
 * @returns {void}
 */
function report () {
  const scripts = collectScripts();
  if (scripts.length === 0) {
    return;
  }
  sendReport(scripts);
}

report();

// SPAs and lazily-loaded widgets add <script> tags after initial load.
// Debounce so a burst of DOM changes only triggers one re-scan.
const debounce = {handle: undefined};
const observer = new MutationObserver(() => {
  clearTimeout(debounce.handle);
  debounce.handle = setTimeout(report, 500);
});
observer.observe(document.documentElement, {childList: true, subtree: true});
