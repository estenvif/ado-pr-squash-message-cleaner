# Azure DevOps PR Commit Cleaner

Removes the automatic prefix `Merged PR #12345 ` from the default commit message when completing pull requests in Azure DevOps.

## Files
- `manifest.json` - Extension manifest (Chrome MV3)
- `content.js` - Content script that cleans the commit message

## Install (Unpacked)
1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (toggle in top-right).
3. Click **Load unpacked**.
4. Select the folder `no-merged-pr-extension` containing these files.
5. Navigate to an Azure DevOps pull request completion page (`Complete` dialog).
6. The script will automatically remove the `Merged PR #... ` prefix if present.

## Customization
Adjust the regex near the top of `content.js` if your organization uses a different prefix pattern.
```js
const PREFIX_REGEX = /^(Merged\s+PR\s+#\d+\s*)/i;
```

## Notes
- Uses a `MutationObserver` and a short-lived interval to catch dynamically inserted dialogs.
- No extra UI or options page per your request.

## Troubleshooting
- If it does not trigger, open DevTools Console and run `window.__prCommitClean()` after the dialog appears.
- Ensure the extension is active (icon visible or listed as enabled in the extensions page).
