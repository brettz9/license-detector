/**
 * Extension settings, persisted with `storage.sync` (falls back to `local`
 * automatically if sync storage isn't available) so they follow the user
 * across machines where supported.
 */

export const DEFAULT_SETTINGS = {
  // Blocking is off by default; detection/signaling is the primary feature.
  blockingEnabled: false,
  // Categories a script must fall into to be left alone when blocking is
  // enabled. Everything else (including "missing"/unlabeled scripts) is
  // blocked. Matches LibreJS's spirit of trusting only affirmatively-free
  // licenses, while remaining fully user-configurable.
  allowedCategories: ['publicDomain', 'permissive', 'weaklyProtective'],
  // When true, a script whose category came from `guessSpdxFromLabel`'s
  // fuzzy name/text matching (see license-db.js's `GUESSED_SOURCES`) is
  // blocked outright when blocking is enabled, even if the guessed
  // category is in `allowedCategories` — since, unlike an explicit
  // `SPDX-License-Identifier` tag, a guess can be wrong (e.g. matching an
  // unrelated word in a comment) and shouldn't by itself be trusted to
  // let a script through. Off by default to match blocking's own
  // default and avoid surprising new blocks on upgrade.
  blockGuesses: false
};

/**
 *
 */
export async function getSettings () {
  const store = chrome.storage.sync ?? chrome.storage.local;
  const {settings} = await store.get('settings');
  return {...DEFAULT_SETTINGS, ...settings};
}

/**
 * @param {Partial<typeof DEFAULT_SETTINGS>} partial
 * @returns {Promise<typeof DEFAULT_SETTINGS>} the merged, persisted settings
 */
export async function setSettings (partial) {
  const store = chrome.storage.sync ?? chrome.storage.local;
  const current = await getSettings();
  const next = {...current, ...partial};
  await store.set({settings: next});
  return next;
}

/**
 * Subscribes to every future settings change. This is an ongoing
 * `addListener`-style event subscription rather than a one-shot
 * asynchronous operation, so a plain callback (rather than a promise) is
 * the right shape here.
 * @param {(settings: typeof DEFAULT_SETTINGS) => void} callback
 * @returns {void}
 */
// eslint-disable-next-line promise/prefer-await-to-callbacks -- see above
export function onSettingsChanged (callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === 'sync' || area === 'local') && changes.settings) {
      // eslint-disable-next-line promise/prefer-await-to-callbacks -- ditto
      callback(changes.settings.newValue ?? DEFAULT_SETTINGS);
    }
  });
}
