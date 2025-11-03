// MV3 service worker for Azure DevOps PR Commit Cleaner
// Injects content.js on initial loads and SPA (history) navigations to PR pages.
// Relies on window.__commitCleanerLoaded guard inside content.js to avoid duplicates.

const PR_URL_REGEX = /https:\/\/(?:dev\.azure\.com|[^\/]+\.visualstudio\.com)\/.*\/_git\/[^\/]+\/pull[rR]equest\//;

function isPrUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return PR_URL_REGEX.test(url);
}

async function injectIfNeeded(tabId, url) {
  if (!isPrUrl(url)) return;
  try {
    // Check flag first to avoid unnecessary injection work.
    const [{ result: alreadyLoaded }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!window.__commitCleanerLoaded,
    });
    if (alreadyLoaded) return;
  } catch (e) {
    // Proceed anyway; detection may fail if page not ready yet.
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    if (globalThis.__prCommitCleanerDebug) {
      console.log('[PRCommitCleaner][background] Injected content.js for', url);
    }
  } catch (e) {
    console.error('[PRCommitCleaner][background] Injection failed', e, url);
  }
}

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return; // top-level only
  injectIfNeeded(details.tabId, details.url);
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0) return; // top-level only
  injectIfNeeded(details.tabId, details.url);
});

// Manual command: user can execute from DevTools console within the tab via chrome.runtime.sendMessage
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg === 'force-pr-commit-cleaner-inject' && sender.tab?.id) {
    injectIfNeeded(sender.tab.id, sender.tab.url);
    sendResponse({ forced: true });
    return true;
  }
});

// Keep lightweight; MV3 service worker will unload when idle.
