/**
 * Optional, opt-in script blocking. Two independent strategies, chosen by
 * feature detection rather than by browser name:
 *
 * - Firefox (and any browser still allowing blocking webRequest + response
 *   streaming in MV3): true first-load blocking. `webRequest.onBeforeRequest`
 *   with `filterResponseData` lets us buffer a script's actual response
 *   bytes, classify them, and either pass them through unmodified or
 *   replace them with an empty (syntactically valid) script — all before
 *   the browser executes anything. This is the only known way to act on a
 *   script's *first* request; Chrome's MV3 has no equivalent capability.
 *
 * - Chrome (and anyone without the above): best-effort blocking via
 *   `declarativeNetRequest` dynamic rules. A script's first-ever load
 *   always executes (we can't classify it before it runs), but once
 *   classified, a persistent rule blocks that exact URL on every future
 *   request — including the first request of later page loads/tabs.
 */

import {classify} from './license-db.js';
import {detectFromSource} from './detector.js';

const DNR_RULE_ID_BASE = 1_000_000; // dynamic rule ids must be positive ints
const urlToRuleId = new Map();
const ruleIdState = {next: DNR_RULE_ID_BASE};

/**
 * @param {string} url
 * @returns {number} a stable declarativeNetRequest rule id for `url`
 */
function ruleIdFor (url) {
  if (!urlToRuleId.has(url)) {
    urlToRuleId.set(url, ruleIdState.next++);
  }
  return urlToRuleId.get(url);
}

/** @returns {boolean} whether this browser can do true first-load blocking */
export function supportsStreamingBlock () {
  return typeof browser !== 'undefined' &&
    Boolean(browser?.webRequest?.filterResponseData);
}

/**
 * Adds (or removes) a declarativeNetRequest rule blocking `url` outright.
 * Used for the Chrome-style "block starting next request" fallback, and
 * also as a persistence layer so already-known-bad scripts are blocked
 * synchronously by the browser's own network stack on every later request,
 * without our background script needing to run at all.
 * @param {string} url
 * @param {boolean} shouldBlock
 */
export async function setDnrBlock (url, shouldBlock) {
  const id = ruleIdFor(url);
  const removeRuleIds = [id];
  const addRules = shouldBlock
    ? [{
      id,
      priority: 1,
      action: {type: 'block'},
      condition: {
        urlFilter: `|${url}|`,
        resourceTypes: ['script']
      }
    }]
    : [];
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds, addRules
  });
}

/**
 * Removes every declarativeNetRequest rule this extension has added.
 * @returns {Promise<void>}
 */
export async function clearAllDnrBlocks () {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((rule) => rule.id);
  if (removeRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds});
  }
}

const streamingState = {listenerActive: false};

/**
 * Registers the Firefox true-blocking listener. `onClassified` is called
 * with `(tabId, url, category, spdxId)` for every script it inspects, so
 * callers can update the badge/popup state the same way the non-blocking
 * detection path does.
 * @param {(url: string) => boolean} shouldBlockCategory
 * @param {(tabId: number, url: string, category: string,
 *   spdxId: string|null) => void} onClassified
 */
export function enableStreamingBlock (shouldBlockCategory, onClassified) {
  if (streamingState.listenerActive || !supportsStreamingBlock()) {
    return;
  }
  streamingState.listenerActive = true;

  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
      const filter = browser.webRequest.filterResponseData(details.requestId);
      const chunks = [];

      filter.ondata = (streamEvent) => {
        chunks.push(new Uint8Array(streamEvent.data));
      };

      filter.onstop = async () => {
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }

        const text = new TextDecoder('utf-8').decode(merged);
        const {spdxId} = detectFromSource(text);
        const category = await classify(spdxId);
        onClassified(details.tabId, details.url, category, spdxId);

        if (shouldBlockCategory(category)) {
          filter.write(new TextEncoder().encode(
            `// Blocked by License Detector: category "${category}" is ` +
            'not in your allowed list.\n'
          ));
        } else {
          filter.write(merged);
        }
        filter.close();
      };

      // `StreamFilter` predates `EventTarget`/`addEventListener` and only
      // exposes these `onX` handler properties, so there is no
      // listener-based API to use here.
      // eslint-disable-next-line unicorn/prefer-add-event-listener -- above
      filter.onerror = () => {
        // If the stream itself failed, let the (now-empty) response through
        // rather than hanging the request.
        try {
          filter.close();
        } catch {
          // already closed
        }
      };

      return {};
    },
    {
      // Insecure http:// pages also load scripts we need to classify; this
      // is a request-matching pattern, not an outbound protocol choice.
      // eslint-disable-next-line sonarjs/no-clear-text-protocols -- above
      urls: ['http://*/*', 'https://*/*'],
      types: ['script']
    },
    ['blocking']
  );
}
