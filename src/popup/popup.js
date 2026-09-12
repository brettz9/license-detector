import {
  getLicenseTypeInfo, dominantCategory, isFlagged, GUESSED_SOURCES
} from '../background/license-db.js';
import {getSettings, setSettings} from '../background/settings.js';
import {toCssColor} from '../shared/colors.js';

const summaryEl = document.querySelector('#summary');
const listEl = document.querySelector('#scriptList');
const emptyStateEl = document.querySelector('#emptyState');
const blockingToggle = document.querySelector('#blockingToggle');

document.querySelector('#openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

blockingToggle.addEventListener('change', () => {
  setSettings({blockingEnabled: blockingToggle.checked});
});

/**
 * @param {string} url
 * @returns {string} the last path segment (or hostname) of `url`
 */
function shortUrl (url) {
  try {
    const u = new URL(url);
    return u.pathname.split('/').pop() || u.hostname;
  } catch {
    return url;
  }
}

/**
 * @returns {Promise<void>}
 */
async function render () {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  const settings = await getSettings();
  blockingToggle.checked = settings.blockingEnabled;

  const typeInfo = await getLicenseTypeInfo();
  const key = `tab-${tab.id}`;
  const {[key]: results} = await chrome.storage.session.get(key);
  const scripts = results?.scripts ?? [];

  if (scripts.length === 0) {
    emptyStateEl.hidden = false;
    summaryEl.style.removeProperty('--summary-color');
    summaryEl.textContent = '';
    listEl.replaceChildren();
    return;
  }
  emptyStateEl.hidden = true;

  const categories = scripts.map((s) => s.category);
  const worst = dominantCategory(categories);
  const worstInfo = typeInfo[worst] ?? {text: worst, color: ['gray']};
  const worstColor = toCssColor(worstInfo.color[0]);
  const flaggedCount = scripts.filter((s) => isFlagged(settings, s)).length;

  summaryEl.style.setProperty('--summary-color', worstColor);
  summaryEl.replaceChildren();
  const summarySwatch = document.createElement('span');
  summarySwatch.className = 'swatch';
  const summaryText = document.createElement('span');
  const scriptCount =
    `${scripts.length} script${scripts.length === 1 ? '' : 's'}`;
  const flaggedText = flaggedCount ? ` · ${flaggedCount} flagged` : '';
  const worstLabel = worst === 'missing'
    ? worstInfo.text.replace('\n', ' ')
    : `Most restrictive: ${worstInfo.text.replace('\n', ' ')}`;
  summaryText.textContent =
    `${scriptCount} detected · ${worstLabel}` + flaggedText;
  summaryEl.append(summarySwatch, summaryText);

  listEl.replaceChildren();
  for (const script of scripts) {
    const info = typeInfo[script.category] ??
      {text: script.category, color: ['gray']};
    const color = toCssColor(info.color[0]);
    const li = document.createElement('li');
    li.style.setProperty('--item-color', color);

    const swatch = document.createElement('span');
    swatch.className = 'swatch';

    const details = document.createElement('span');
    details.className = 'details';

    const urlSpan = document.createElement('span');
    urlSpan.className = 'url';
    urlSpan.textContent = script.inline
      ? '(inline script)'
      : shortUrl(script.key);

    const metaSpan = document.createElement('span');
    metaSpan.className = 'meta';
    const spdxText = script.spdxId ? ` · ${script.spdxId}` : '';
    metaSpan.textContent = `${info.text.replace('\n', ' ')}${spdxText}`;
    details.append(urlSpan, metaSpan);

    if (GUESSED_SOURCES.has(script.source)) {
      const guessSpan = document.createElement('span');
      guessSpan.className = 'guess';
      guessSpan.textContent = 'best guess, not a confirmed license tag';
      details.append(guessSpan);
    }

    li.append(swatch, details);
    listEl.append(li);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' || changes.settings) {
    render();
  }
});
await render();
