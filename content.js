// Azure DevOps PR Commit Cleaner (SPA injection fix + un gated squash refactor)
// Removes leading "Merged PR 12345:" or "Merged PR #12345:". Cleaning occurs opportunistically; if user later switches to Squash, cleaning re-runs.
(function () {
	// Prevent duplicate initialization on repeated injections.
	if (window.__commitCleanerLoaded) return;
	window.__commitCleanerLoaded = true;

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
				get: function () { return desc.get.call(this); },
				set: function (v) {
					let newVal = v;
					try { if (typeof v === "string" && PREFIX_REGEX.test(v)) newVal = cleanValue(v); } catch (e) { }
					desc.set.call(this, newVal);
				},
			});
			proto.__commitCleanerPatched = true;
		});
		__commitCleanerPatched = true;
	}

	activateValuePatch();

	const log = (...args) => { if (window.__prCommitCleanerDebug) console.log("[PRCommitCleaner]", ...args); };

	const initializedDialogs = new WeakSet();

	function isSquashSelected(root) {
		const scope = root || document;
		const dropdowns = scope.querySelectorAll('input[aria-roledescription="Dropdown"]');
		for (const d of dropdowns) { const val = (d.value || "").trim(); if (/^Squash commit$/i.test(val)) return true; }
		const combos = scope.querySelectorAll('[role="combobox"], [aria-haspopup="menu"]');
		for (const c of combos) { const txt = (c.textContent || "").trim(); if (/Squash commit/i.test(txt)) return true; }
		return false;
	}

	function setNativeValue(el, value) {
		const prototype = el.constructor.prototype;
		const valueDescriptor = Object.getOwnPropertyDescriptor(prototype, "value");
		if (valueDescriptor && valueDescriptor.set) valueDescriptor.set.call(el, value); else el.value = value;
	}

	function cleanValue(v) { return !v ? v : v.replace(PREFIX_REGEX, ""); }

	function cleanElement(el) {
		if (!el) return false;
		const current = el.isContentEditable ? el.textContent : el.value;
		if (!PREFIX_REGEX.test(current)) return false;
		const cleaned = cleanValue(current);
		if (cleaned === current) return false;
		if (el.isContentEditable) el.textContent = cleaned; else setNativeValue(el, cleaned);
		el.dispatchEvent(new Event("input", { bubbles: true }));
		el.dispatchEvent(new Event("change", { bubbles: true }));
		log("Cleaned commit message prefix");
		return true;
	}

	function getMessageNodes(root) {
		const scope = root || document;
		return Array.from(scope.querySelectorAll('input, textarea, div[contenteditable="true"]'));
	}

	function cleanAll(root) {
		let cleanedAny = false;
		getMessageNodes(root).forEach(n => { if (cleanElement(n)) cleanedAny = true; });
		return cleanedAny;
	}

	function findCustomizeCheckbox(root) {
		const scope = root || document;
		return Array.from(scope.querySelectorAll('div[role="checkbox"][aria-checked]')).find(el => {
			const txt = (el.textContent || "").trim();
			return /customize/i.test(txt) && /merge/i.test(txt) && /commit/i.test(txt);
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
				setTimeout(() => runForDialog(root, state), 100);
				setTimeout(() => runForDialog(root, state), 500);
			}
		} else { state.customizeEnsured = true; }
	}

	function runForDialog(dialogRoot, state) {
		const cleaned = cleanAll(dialogRoot);
		if (cleaned) state.cleanedOnce = true;
		ensureCustomize(dialogRoot, state);
		const squashNow = isSquashSelected(dialogRoot);
		if (squashNow && !state.squashDetected) {
			state.squashDetected = true;
			window.__commitCleanerSquashActive = true;
			const cleaned2 = cleanAll(dialogRoot);
			if (cleaned2) state.cleanedOnce = true;
		}
		if (!state.success && (state.cleanedOnce || state.squashDetected)) state.success = true;
		log('Attempt', { cleaned, squash: squashNow, customize: !!state.customizeEnsured, success: state.success });
	}

	function attachMergeStrategyListener(dialogRoot, state) {
		const handler = () => runForDialog(dialogRoot, state);
		dialogRoot.addEventListener("change", handler, true);
	}

	function attachCompleteButtonListener(dialogRoot, state) {
		const buttons = dialogRoot.querySelectorAll('button, div[role="button"]');
		const completeBtn = Array.from(buttons).find(b => /(^|\b)(complete)(\b|$)/i.test(b.textContent || ""));
		if (!completeBtn || completeBtn.__commitCleanerHooked) return;
		completeBtn.__commitCleanerHooked = true;
		completeBtn.addEventListener("click", () => {
			runForDialog(dialogRoot, state);
			queueMicrotask(() => runForDialog(dialogRoot, state));
			setTimeout(() => runForDialog(dialogRoot, state), 0);
			setTimeout(() => runForDialog(dialogRoot, state), 150);
			setTimeout(() => runForDialog(dialogRoot, state), 300);
		}, true);
		log("Attached Complete button listener");
	}

	function debounceRun(dialogRoot, state) {
		clearTimeout(state.debounceTimer);
		state.debounceTimer = setTimeout(() => runForDialog(dialogRoot, state), 75);
	}

	function observeDialogFields(dialogRoot, state) {
		if (dialogRoot.__commitCleanerFieldObserver) return;
		try {
			const fieldObserver = new MutationObserver((muts) => {
				let relevant = false;
				for (const m of muts) {
					if (m.type === 'childList') {
						m.addedNodes.forEach(n => {
							if (n.nodeType !== 1) return;
							const el = n;
							if (el.matches?.('input,textarea,div[contenteditable="true"]') || el.querySelector?.('input,textarea,div[contenteditable="true"]')) relevant = true;
							if (/squash commit/i.test(el.textContent || '')) relevant = true;
							if (/customize.*merge.*commit/i.test(el.textContent || '')) relevant = true;
						});
					} else if (m.type === 'characterData') {
						if (/squash commit/i.test(m.target.textContent)) relevant = true;
					} else if (m.type === 'attributes') {
						const t = m.target;
						if (t && (t.getAttribute('aria-roledescription') === 'Dropdown' || t.getAttribute('role') === 'combobox')) relevant = true;
					}
				}
				if (relevant) debounceRun(dialogRoot, state);
			});
			fieldObserver.observe(dialogRoot, { childList: true, subtree: true, characterData: true, attributes: true });
			dialogRoot.__commitCleanerFieldObserver = fieldObserver;
		} catch (e) { }
	}

	function scheduleAttempts(dialogRoot, state) {
		const delays = [0, 50, 150, 400, 1000, 2000, 3000, 5000, 8000];
		delays.forEach(d => setTimeout(() => { runForDialog(dialogRoot, state); }, d));
		// High-frequency early window (stop after 10s or once cleaned)
		let intervalCount = 0;
		const earlyInterval = setInterval(() => {
			intervalCount++;
			if (state.cleanedOnce || intervalCount > 20) { clearInterval(earlyInterval); return; }
			runForDialog(dialogRoot, state);
		}, 500);
	}

	function initDialog(dialogRoot) {
		if (initializedDialogs.has(dialogRoot)) return;
		initializedDialogs.add(dialogRoot);
		const state = { customizeEnsured: false, success: false, debounceTimer: null, cleanedOnce: false, squashDetected: false };
		dialogRoot.__commitCleanerState = state;
		observeDialogFields(dialogRoot, state);
		scheduleAttempts(dialogRoot, state);
		// Attach per-node observers to message fields for late value population
		getMessageNodes(dialogRoot).forEach(n => {
			if (n.__commitCleanerNodeObs) return;
			try {
				const mo = new MutationObserver(() => debounceRun(dialogRoot, state));
				mo.observe(n, { characterData: true, subtree: true, attributes: true, attributeFilter: ['value'] });
				n.__commitCleanerNodeObs = mo;
			} catch (e) { }
		});
		attachMergeStrategyListener(dialogRoot, state);
		attachCompleteButtonListener(dialogRoot, state);
		log("Initialized dialog (un-gated)");
	}

	function detectDialogsAndInit(rootNode) {
		const candidates = [];
		const allDialogs = document.querySelectorAll('[role="dialog"], div.dialog, div[aria-modal="true"]');
		allDialogs.forEach(d => {
			const txt = (d.textContent || "").toLowerCase();
			if (/complete/.test(txt)) candidates.push(d);
		});
		candidates.forEach(initDialog);
	}

	const dialogObserver = new MutationObserver((muts) => {
		for (const m of muts) {
			m.addedNodes && m.addedNodes.forEach(n => {
				if (!(n instanceof HTMLElement)) return;
				if (n.getAttribute && (n.getAttribute("role") === "dialog" || n.getAttribute("aria-modal") === "true")) {
					detectDialogsAndInit(n);
				} else if (n.querySelector) {
					const dlg = n.querySelector('[role="dialog"], div.dialog, div[aria-modal="true"]');
					if (dlg) detectDialogsAndInit(dlg);
				}
			});
		}
	});

	dialogObserver.observe(document.documentElement, { childList: true, subtree: true });

	document.addEventListener("visibilitychange", () => { if (!document.hidden) detectDialogsAndInit(); });

	setInterval(() => detectDialogsAndInit(), 15000);

	detectDialogsAndInit();

	window.__prCommitClean = () => detectDialogsAndInit();
	window.__prCommitCleanerForce = () => { document.querySelectorAll('[role="dialog"], div.dialog, div[aria-modal="true"]').forEach(d => { const st = d.__commitCleanerState; if (st) runForDialog(d, st); }); };
})();
