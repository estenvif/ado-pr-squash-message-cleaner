// Azure DevOps PR Commit Cleaner (event-driven refactor)
// Removes leading "Merged PR 12345:" or "Merged PR #12345:" only for Squash commit merges.
(function () {
	const PREFIX_REGEX = /^Merged\s+PR\s+#?\d+\s*(?::\s*)?/i;

	let __commitCleanerPatched = false;
	function activateValuePatch() {
		if (__commitCleanerPatched) return;
		[HTMLInputElement, HTMLTextAreaElement].forEach((Ctor) => {
			if (!Ctor) return;
			const proto = Ctor.prototype;
			if (proto.__commitCleanerPatched) return;
			const desc = Object.getOwnPropertyDescriptor(proto, "value");
			if (!desc || !desc.set || !desc.get) return;
			Object.defineProperty(proto, "value", {
				configurable: true,
				enumerable: desc.enumerable,
				get: function () {
					return desc.get.call(this);
				},
				set: function (v) {
					let newVal = v;
					try {
						if (
							window.__commitCleanerSquashActive &&
							typeof v === "string" &&
							PREFIX_REGEX.test(v)
						) {
							newVal = cleanValue(v);
						}
					} catch (e) { }
					desc.set.call(this, newVal);
				},
			});
			proto.__commitCleanerPatched = true;
		});
		__commitCleanerPatched = true;
	}

	// Public debug toggle (optional minimal logging)
	const log = (...args) => {
		if (window.__prCommitCleanerDebug)
			console.log("[PRCommitCleaner]", ...args);
	};

	// Track dialogs we have initialized (WeakSet so garbage collection is natural)
	const initializedDialogs = new WeakSet();

	function isSquashSelected(root) {
		const scope = root || document;
		const dropdowns = scope.querySelectorAll(
			'input[aria-roledescription="Dropdown"]',
		);
		for (const d of dropdowns) {
			const val = (d.value || "").trim();
			if (/^Squash commit$/i.test(val)) return true;
		}
		const combos = scope.querySelectorAll(
			'[role="combobox"], [aria-haspopup="menu"]',
		);
		for (const c of combos) {
			const txt = (c.textContent || "").trim();
			if (/Squash commit/i.test(txt)) return true;
		}
		return false;
	}

	function setNativeValue(el, value) {
		const prototype = el.constructor.prototype;
		const valueDescriptor = Object.getOwnPropertyDescriptor(prototype, "value");
		if (valueDescriptor && valueDescriptor.set) {
			valueDescriptor.set.call(el, value);
		} else {
			el.value = value;
		}
	}

	function cleanValue(v) {
		if (!v) return v;
		return v.replace(PREFIX_REGEX, "");
	}

	function cleanElement(el) {
		if (!el) return false;
		const current = el.isContentEditable ? el.textContent : el.value;
		if (!PREFIX_REGEX.test(current)) return false;
		const cleaned = cleanValue(current);
		if (cleaned === current) return false;
		if (el.isContentEditable) {
			el.textContent = cleaned;
		} else {
			setNativeValue(el, cleaned);
		}
		el.dispatchEvent(new Event("input", { bubbles: true }));
		el.dispatchEvent(new Event("change", { bubbles: true }));
		log("Cleaned commit message prefix");
		return true;
	}

	function getMessageNodes(root) {
		const scope = root || document;
		return Array.from(
			scope.querySelectorAll(
				'input[type="text"], textarea, div[contenteditable="true"]',
			),
		);
	}

	function cleanAll(root) {
		getMessageNodes(root).forEach((n) => cleanElement(n));
	}

	function findCustomizeCheckbox(root) {
		const scope = root || document;
		return Array.from(
			scope.querySelectorAll('div[role="checkbox"][aria-checked]'),
		).find((el) => {
			const txt = (el.textContent || "").trim();
			return (
				/customize/i.test(txt) && /merge/i.test(txt) && /commit/i.test(txt)
			);
		});
	}

	function ensureCustomize(root, state) {
		const box = findCustomizeCheckbox(root);
		if (!box) return;
		if (box.getAttribute("aria-checked") !== "true") {
			box.click();
			if (box.getAttribute("aria-checked") === "true") {
				state.customizeEnsured = true;
				log("Checked customize commit checkbox");
			}
		} else {
			state.customizeEnsured = true;
		}
	}

	function runForDialog(dialogRoot, state) {
		if (!isSquashSelected(dialogRoot)) return;
		window.__commitCleanerSquashActive = true;
		activateValuePatch();
		ensureCustomize(dialogRoot, state);
		cleanAll(dialogRoot);
	}

	function attachMergeStrategyListener(dialogRoot, state) {
		const handler = () => {
			runForDialog(dialogRoot, state);
		};
		dialogRoot.addEventListener("change", handler, true);
	}

	function attachCompleteButtonListener(dialogRoot, state) {
		// Look for a button likely to complete; heuristic based on text.
		const buttons = dialogRoot.querySelectorAll('button, div[role="button"]');
		const completeBtn = Array.from(buttons).find((b) =>
			/(^|\b)(complete)(\b|$)/i.test(b.textContent || ""),
		);
		if (!completeBtn) return;
		if (completeBtn.__commitCleanerHooked) return;
		completeBtn.__commitCleanerHooked = true;
		completeBtn.addEventListener(
			"click",
			() => {
				runForDialog(dialogRoot, state); // final clean right before completion
			},
			true,
		); // capture to run before site handlers if possible
		log("Attached Complete button listener");
	}

	function initDialog(dialogRoot) {
		if (initializedDialogs.has(dialogRoot)) return;
		initializedDialogs.add(dialogRoot);
		const state = { customizeEnsured: false };
		dialogRoot.__commitCleanerState = state;

		// Initial clean after current frame & slight delay to catch async population
		requestAnimationFrame(() => runForDialog(dialogRoot, state));
		setTimeout(() => runForDialog(dialogRoot, state), 1120);

		attachMergeStrategyListener(dialogRoot, state);
		attachCompleteButtonListener(dialogRoot, state);
		log("Initialized dialog");
	}

	function detectDialogsAndInit(rootNode) {
		// Heuristic: Azure DevOps completion dialog generally has role dialog and contains text 'Complete pull request'
		const candidates = [];
		const allDialogs = document.querySelectorAll(
			'[role="dialog"], div.dialog, div[aria-modal="true"]',
		);
		allDialogs.forEach((d) => {
			const txt = (d.textContent || "").toLowerCase();
			if (
				/complete pull request/.test(txt) ||
				/enable automatic completion/i.test(txt) ||
				(/complete/i.test(txt) && /squash commit/i.test(txt))
			) {
				candidates.push(d);
			}
		});
		candidates.forEach(initDialog);
	}

	// Focused MutationObserver: only watch for additions of potential dialogs
	const dialogObserver = new MutationObserver((muts) => {
		for (const m of muts) {
			m.addedNodes &&
				m.addedNodes.forEach((n) => {
					if (!(n instanceof HTMLElement)) return;
					if (
						n.getAttribute &&
						(n.getAttribute("role") === "dialog" ||
							n.getAttribute("aria-modal") === "true")
					) {
						detectDialogsAndInit(n);
					} else if (n.querySelector) {
						// Search within subtree if any dialog-like element appeared
						const dlg = n.querySelector(
							'[role="dialog"], div.dialog, div[aria-modal="true"]',
						);
						if (dlg) detectDialogsAndInit(dlg);
					}
				});
		}
	});

	dialogObserver.observe(document.documentElement, {
		childList: true,
		subtree: true,
	});

	// Idle page resilience: when tab becomes visible again, rescan.
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) detectDialogsAndInit();
	});

	// Periodic lightweight watchdog (runs rarely)
	setInterval(() => detectDialogsAndInit(), 45000);

	// Initial scan in case dialog already present
	detectDialogsAndInit();

	// Expose manual trigger & debug
	window.__prCommitClean = () => detectDialogsAndInit();
})();
