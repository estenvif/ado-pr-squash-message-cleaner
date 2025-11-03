# Azure DevOps PR Commit Cleaner

Removes the automatic prefix `Merged PR #12345` from the default commit message when completing pull requests in Azure DevOps.

## Files

- `manifest.json` - Extension manifest (Chrome MV3)
- `background.js` - MV3 service worker that re-injects `content.js` on SPA navigations
- `content.js` - Content script that cleans the commit message

## Install (Unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (toggle in top-right).
3. Click **Load unpacked**.
4. Select the folder `no-merged-pr-extension` containing these files.
5. Navigate to an Azure DevOps pull request completion page (`Complete` dialog).
6. The script will automatically remove the `Merged PR #...` prefix if present.

## Customization

Adjust the regex near the top of `content.js` if your organization uses a different prefix pattern.

```js
const PREFIX_REGEX = /^(Merged\s+PR\s+#\d+\s*)/i;
```

## Notes

- Uses `MutationObserver` plus scheduled attempts to handle dynamically inserted dialogs.
- Azure DevOps is a SPA; navigation within the site may not refresh the page. `background.js` listens for `webNavigation.onCommitted` and `onHistoryStateUpdated` to inject `content.js` after in-app route changes.
- A guard (`window.__commitCleanerLoaded`) prevents duplicate initialization after reinjection.

## Troubleshooting

- If cleaning does not trigger, open DevTools Console and run `window.__prCommitClean()`.
- To force re-cleaning attempts inside an existing dialog run `window.__prCommitCleanerForce()`.
- If the script seems absent after SPA navigation, toggle a merge strategy or open the Complete dialog and check `window.__commitCleanerLoaded` in DevTools (should be `true`). If `false`, the background injection may have failed; reload the tab.
- Ensure the extension is active (listed as enabled in `chrome://extensions`).
