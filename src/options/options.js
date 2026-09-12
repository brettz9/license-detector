import {getLicenseTypeInfo} from '../background/license-db.js';
import {getSettings, setSettings} from '../background/settings.js';
import {toCssColor} from '../shared/colors.js';

const blockingEnabledEl = document.querySelector('#blockingEnabled');
const blockingModeNoteEl = document.querySelector('#blockingModeNote');
const blockGuessesEl = document.querySelector('#blockGuesses');
const categoryListEl = document.querySelector('#categoryList');
const clearCacheBtn = document.querySelector('#clearCache');
const clearCacheStatusEl = document.querySelector('#clearCacheStatus');

const STREAMING_PERMISSIONS = [
  'webRequestBlocking', 'webRequestFilterResponse'
];
const isFirefox = typeof browser !== 'undefined' &&
  Boolean(browser?.webRequest?.filterResponseData);

/**
 * @returns {Promise<void>}
 */
async function describeBlockingMode () {
  if (!isFirefox) {
    blockingModeNoteEl.textContent =
      'This browser has no way to inspect a script before its first load, ' +
      'so blocking here is best-effort: once a script is classified, it’s ' +
      'blocked on its next request (reload the page to apply it to scripts ' +
      'already seen).';
    return;
  }
  const granted = await chrome.permissions.contains({
    permissions: STREAMING_PERMISSIONS
  });
  blockingModeNoteEl.textContent = granted
    ? 'True first-load blocking is active (response streaming permission ' +
      'granted).'
    : 'Enabling blocking will ask for an additional permission so scripts ' +
      'can be blocked on their very first load, instead of only on later ' +
      'ones.';
}

/**
 * @returns {Promise<void>}
 */
async function requestStreamingPermissionIfNeeded () {
  if (!isFirefox) {
    return;
  }
  const granted = await chrome.permissions.contains({
    permissions: STREAMING_PERMISSIONS
  });
  if (!granted) {
    await chrome.permissions.request({permissions: STREAMING_PERMISSIONS});
  }
  await describeBlockingMode();
}

/**
 * @returns {Promise<void>}
 */
async function renderCategories () {
  const [typeInfo, settings] = await Promise.all([
    getLicenseTypeInfo(), getSettings()
  ]);
  categoryListEl.replaceChildren();

  for (const [category, info] of Object.entries(typeInfo)) {
    const id = `category-${category}`;
    const li = document.createElement('li');
    li.style.setProperty('--item-color', toCssColor(info.color[0]));

    const swatch = document.createElement('span');
    swatch.className = 'swatch';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    checkbox.checked = settings.allowedCategories.includes(category);

    const label = document.createElement('label');
    label.className = 'row';
    label.htmlFor = id;
    label.append(checkbox, ` ${info.text.replace('\n', ' ')}`);

    li.append(swatch, label);
    checkbox.addEventListener('change', async () => {
      const current = await getSettings();
      const allowedCategories = checkbox.checked
        ? [...new Set([...current.allowedCategories, category])]
        : current.allowedCategories.filter((c) => c !== category);
      await setSettings({allowedCategories});
    });
    categoryListEl.append(li);
  }
}

blockingEnabledEl.addEventListener('change', async () => {
  if (blockingEnabledEl.checked) {
    await requestStreamingPermissionIfNeeded();
  }
  await setSettings({blockingEnabled: blockingEnabledEl.checked});
});

blockGuessesEl.addEventListener('change', async () => {
  await setSettings({blockGuesses: blockGuessesEl.checked});
});

clearCacheBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove('classificationCache');
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = rules.map((r) => r.id);
  if (removeRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds});
  }
  clearCacheStatusEl.textContent = 'Cache cleared.';
  setTimeout(() => {
    clearCacheStatusEl.textContent = '';
  }, 2000);
});

/**
 * @returns {Promise<void>}
 */
async function init () {
  const settings = await getSettings();
  blockingEnabledEl.checked = settings.blockingEnabled;
  blockGuessesEl.checked = settings.blockGuesses;
  await describeBlockingMode();
  await renderCategories();
}

await init();
