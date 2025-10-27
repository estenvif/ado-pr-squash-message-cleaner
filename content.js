// Azure DevOps PR Commit Cleaner (simplified logging)
// Removes leading "Merged PR 12345:" or "Merged PR #12345:" only for Squash commit merges.
(function () {
	const PREFIX_REGEX = /^Merged\s+PR\s+#?\d+\s*(?::\s*)?/i;
	let customizeDone = false;

	function isSquashSelected() {
		const dropdowns = document.querySelectorAll(
			'input[aria-roledescription="Dropdown"]',
		);
		for (const d of dropdowns) {
			const val = (d.value || "").trim();
			if (/^Squash commit$/i.test(val)) return true;
		}
		const combos = document.querySelectorAll(
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

		return true;
	}

	function scan() {
		const nodes = document.querySelectorAll(
			'input[type="text"], textarea, div[contenteditable="true"]',
		);
		nodes.forEach((n) => cleanElement(n));
	}

	function patchPrototypes() {
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
					const cleaned = cleanValue(v);
					desc.set.call(this, cleaned);
				},
			});
			proto.__commitCleanerPatched = true;
		});
	}

	function ensureCustomize() {
		if (customizeDone) return;
		const box = Array.from(
			document.querySelectorAll('div[role="checkbox"][aria-checked]'),
		).find((el) => {
			const txt = (el.textContent || "").trim();
			return (
				/customize/i.test(txt) && /merge/i.test(txt) && /commit/i.test(txt)
			);
		});
		if (box && box.getAttribute("aria-checked") !== "true") {
			box.click();
			if (box.getAttribute("aria-checked") === "true") {
				customizeDone = true;
			}
		}
	}

	function run() {
		if (!isSquashSelected()) return;
		ensureCustomize();
		scan();
	}

	const observer = new MutationObserver(() => run());
	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
		characterData: true,
		attributes: true,
	});

	window.addEventListener("input", (e) => {
		if (isSquashSelected()) cleanElement(e.target);
	});
	window.addEventListener("change", (e) => {
		if (isSquashSelected()) cleanElement(e.target);
	});

	patchPrototypes();
	[0, 250, 800].forEach((ms) => setTimeout(run, ms));

	window.__prCommitClean = run;
})();
