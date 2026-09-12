import {
  classify, dominantCategory, getLicenseTypeInfo, guessSpdxFromLabel,
  isFlagged
} from './license-db.js';
import {detectFromSource} from './detector.js';
import {
  setDnrBlock, clearAllDnrBlocks, supportsStreamingBlock, enableStreamingBlock
} from './blocking.js';
import {getSettings, onSettingsChanged} from './settings.js';
import {toCssColor} from '../shared/colors.js';

// Persistent cache: script URL -> {category, spdxId, source}. Shared across
// tabs/sessions since the same script URL usually carries the same license.
const CACHE_KEY = 'classificationCache';

/**
 * @param {typeof import('./settings.js').DEFAULT_SETTINGS} settings
 * @param {{category: string, source: string}} entry
 * @returns {boolean} whether `entry` should be declarativeNetRequest-blocked
 */
function shouldBlockEntry (settings, entry) {
  return settings.blockingEnabled && isFlagged(settings, entry);
}

/**
 * @returns {Promise<Object<string, {category: string, spdxId: string|null,
 *   source: string}>>} the persisted classification cache
 */
async function getCache () {
  const {[CACHE_KEY]: cache} = await chrome.storage.local.get(CACHE_KEY);
  return cache ?? {};
}

/**
 * @param {string} url
 * @param {{category: string, spdxId: string|null, source: string}} entry
 * @returns {Promise<void>}
 */
async function saveCacheEntry (url, entry) {
  const cache = await getCache();
  await chrome.storage.local.set({[CACHE_KEY]: {...cache, [url]: entry}});
}

/**
 * @param {number} tabId
 * @returns {Promise<{pageUrl?: string, scripts: Object<string, object>}>}
 */
async function getTabResults (tabId) {
  const key = `tab-${tabId}`;
  const {[key]: results} = await chrome.storage.session.get(key);
  return results ?? {scripts: {}};
}

/**
 * @param {number} tabId
 * @param {{pageUrl?: string, scripts: Object<string, object>}} results
 * @returns {Promise<void>}
 */
async function saveTabResults (tabId, results) {
  const key = `tab-${tabId}`;
  await chrome.storage.session.set({[key]: results});
}

/**
 * @param {number} tabId
 * @param {{pageUrl?: string, scripts: Object<string, object>}} results
 * @returns {Promise<void>}
 */
async function updateBadge (tabId, results) {
  const settings = await getSettings();
  const categories = Object.values(results.scripts).map((s) => s.category);
  if (categories.length === 0) {
    await chrome.action.setBadgeText({tabId, text: ''});
    await chrome.action.setIcon({tabId, path: iconPaths('neutral')});
    return;
  }

  const worst = dominantCategory(categories);
  const flaggedCount = Object.values(results.scripts).filter(
    (s) => isFlagged(settings, s)
  ).length;

  const typeInfo = await getLicenseTypeInfo();
  const color = toCssColor(typeInfo[worst]?.color?.[0] ?? 'gray');

  await chrome.action.setIcon({tabId, path: iconPaths(worst)});
  // Experiment: some browsers appear to skip repainting the toolbar icon
  // when the badge text call that follows it sets the same value it
  // already had. Clearing it first forces an actual state transition.
  await chrome.action.setBadgeText({tabId, text: ''});
  await chrome.action.setBadgeText({
    tabId, text: flaggedCount > 0 ? String(flaggedCount) : ''
  });
  await chrome.action.setBadgeBackgroundColor({tabId, color});
}

/**
 * @param {string} category
 * @returns {Object<number, string>} icon size -> path, for `action.setIcon`
 */
function iconPaths (category) {
  return {
    16: chrome.runtime.getURL(`src/icons/icon-${category}-16.png`),
    32: chrome.runtime.getURL(`src/icons/icon-${category}-32.png`),
    48: chrome.runtime.getURL(`src/icons/icon-${category}-48.png`),
    128: chrome.runtime.getURL(`src/icons/icon-${category}-128.png`)
  };
}

/**
 * Classifies one external script, using the cache when possible, and
 * returns the result. Also syncs the declarativeNetRequest block rule for
 * it according to current settings.
 * @param {string} url
 * @param {{text: string, href: string}|undefined} webLabelHint
 * @returns {Promise<{category: string, spdxId: string|null, source: string}>}
 */
async function classifyExternalScript (url, webLabelHint) {
  const cache = await getCache();
  let entry = cache[url];

  if (!entry) {
    let spdxId = null;
    let source = 'unlabeled';
    try {
      const res = await fetch(url);
      const text = await res.text();
      const detected = detectFromSource(text);
      if (detected.spdxId) {
        ({spdxId} = detected);
        source = 'spdx-comment';
      } else if (detected.licenseUrl) {
        spdxId = guessSpdxFromLabel(detected.licenseUrl);
        source = spdxId ? 'in-script-license-url' : 'unlabeled';
      } else if (detected.licenseText) {
        spdxId = guessSpdxFromLabel(detected.licenseText);
        source = spdxId ? 'in-script-license-text' : 'unlabeled';
      }
    } catch {
      // Network error, opaque cross-origin response, etc. Treat as unlabeled
      // rather than failing the whole page's report.
    }

    if (!spdxId && webLabelHint) {
      spdxId = guessSpdxFromLabel(webLabelHint.text) ??
        guessSpdxFromLabel(webLabelHint.href);
      if (spdxId) {
        source = 'web-labels-table';
      }
    }

    const category = await classify(spdxId);
    entry = {spdxId, category, source};
    await saveCacheEntry(url, entry);
  }

  const settings = await getSettings();
  await setDnrBlock(url, shouldBlockEntry(settings, entry));

  return entry;
}

/**
 * Handles a `PAGE_SCRIPTS` message from a content script: classifies every
 * script on the page and persists the results for the popup/badge.
 * @param {{pageUrl: string, scripts: object[], webLabels: object}} message
 * @param {chrome.runtime.MessageSender} sender
 * @returns {Promise<void>}
 */
async function handlePageScripts (message, sender) {
  const tabId = sender.tab?.id;
  if (tabId === undefined) {
    return;
  }

  const results = {pageUrl: message.pageUrl, scripts: {}};

  await Promise.all(message.scripts.map(async (script) => {
    if (script.inline) {
      const detected = detectFromSource(script.text ?? '');
      const spdxId = detected.spdxId ??
        guessSpdxFromLabel(detected.licenseUrl) ??
        guessSpdxFromLabel(detected.licenseText);
      const category = await classify(spdxId);
      let source = 'unlabeled';
      if (detected.spdxId) {
        source = 'spdx-comment';
      } else if (spdxId && detected.licenseUrl) {
        source = 'in-script-license-url';
      } else if (spdxId && detected.licenseText) {
        source = 'in-script-license-text';
      }
      results.scripts[`inline#${script.index}`] = {
        spdxId,
        category,
        source,
        inline: true
      };
      return;
    }

    const webLabelHint = message.webLabels?.[script.src];
    const entry = await classifyExternalScript(script.src, webLabelHint);
    results.scripts[script.src] = {...entry, inline: false};
  }));

  await saveTabResults(tabId, results);
  await updateBadge(tabId, results);
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'PAGE_SCRIPTS') {
    handlePageScripts(message, sender);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`tab-${tabId}`);
});

// Re-derive DNR block rules whenever blocking settings change.
onSettingsChanged(async (settings) => {
  await clearAllDnrBlocks();
  if (!settings.blockingEnabled) {
    return;
  }
  const cache = await getCache();
  await Promise.all(
    Object.entries(cache).map(([url, entry]) => setDnrBlock(
      url, shouldBlockEntry(settings, entry)
    ))
  );
});

let streamingShouldBlock;

// Firefox-only true first-load blocking, enabled lazily once the optional
// webRequestBlocking/webRequestFilterResponse permissions are granted (the
// user opts in from the options page).
/**
 * @returns {Promise<void>}
 */
async function maybeEnableStreamingBlock () {
  if (!supportsStreamingBlock()) {
    return;
  }
  const granted = await chrome.permissions.contains({
    permissions: ['webRequestBlocking', 'webRequestFilterResponse']
  });
  if (!granted) {
    return;
  }
  enableStreamingBlock(
    (category) => {
      // Read fresh each call rather than capturing settings once.
      return streamingShouldBlock(category);
    },
    async (tabId, url, category, spdxId) => {
      const results = await getTabResults(tabId);
      results.scripts[url] = {
        spdxId, category, source: 'spdx-comment', inline: false,
        streaming: true
      };
      await saveTabResults(tabId, results);
      await updateBadge(tabId, results);
    }
  );
}

// eslint-disable-next-line @stylistic/max-len -- Long
// eslint-disable-next-line unicorn/prefer-top-level-await -- Errs for service workers on Chrome
(async () => {
// A synchronously-readable settings cache: `streamingShouldBlock` is called
// from the Firefox `StreamFilter` callback above, which can't await.
const streamingSettingsCache = {settings: await getSettings()};
onSettingsChanged((s) => {
  streamingSettingsCache.settings = s;
});

/**
 * @param {string} category
 * @returns {boolean}
 */
// eslint-disable-next-line @stylistic/max-len -- Long
// eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- Needed
streamingShouldBlock = (category) => {
  const {settings} = streamingSettingsCache;
  return Boolean(settings?.blockingEnabled) &&
    !settings.allowedCategories.includes(category);
};

chrome.permissions.onAdded?.addListener(maybeEnableStreamingBlock);

await maybeEnableStreamingBlock();
})();
