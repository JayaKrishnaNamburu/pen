/**
 * AX2: one visually-hidden live region per editor root.
 * Rate-limit one per key per 500ms, latest wins.
 *
 * wave-3-adopt: announcement writes (`aria-live` + textContent) move
 * into DomScheduler.write when wired. Construction of the region is
 * wave-3-exempt — the node must exist before the first announce.
 *
 * Wave 3.4 inventory is `rg 'wave-3-(adopt|exempt)'` across a11y/.
 * `rg wave-3-adopt` alone is not the inventory: focus-sink writes are
 * exempt (see focusSink.ts) and must not be converted with this file.
 *
 * ARIA booleans stay the literal strings "true"/"false". Do not apply
 * the data-* present/absent spelling to `aria-atomic` (or any ARIA
 * boolean). `aria-live` is a token (`polite`/`assertive`), not a boolean.
 */

export const ANNOUNCE_RATE_LIMIT_MS = 500;

export type AnnouncerPriority = "polite" | "assertive";

export interface Announcer {
	announce(
		message: string,
		priority?: AnnouncerPriority,
		key?: string,
	): void;
	dispose(): void;
}

type PendingWrite = {
	message: string;
	priority: AnnouncerPriority;
};

type KeyGate = {
	lastWrittenAt: number;
	timeout: ReturnType<typeof setTimeout> | undefined;
	pending: PendingWrite | undefined;
};

export function createAnnouncer(root?: ParentNode): Announcer {
	const doc = resolveDocument(root);
	const region = doc ? createLiveRegion(doc, root) : null;
	const gates = new Map<string, KeyGate>();
	let disposed = false;

	const flushPending = (gate: KeyGate): void => {
		gate.timeout = undefined;
		const pending = gate.pending;
		gate.pending = undefined;
		if (pending === undefined || disposed) {
			return;
		}
		write(region, pending.message, pending.priority);
		gate.lastWrittenAt = Date.now();
	};

	return {
		announce(message, priority = "polite", key = message) {
			if (disposed || region === null) {
				return;
			}

			const now = Date.now();
			let gate = gates.get(key);
			if (gate === undefined) {
				gate = { lastWrittenAt: 0, timeout: undefined, pending: undefined };
				gates.set(key, gate);
			}

			if (gate.lastWrittenAt === 0 || now - gate.lastWrittenAt >= ANNOUNCE_RATE_LIMIT_MS) {
				write(region, message, priority);
				gate.lastWrittenAt = now;
				return;
			}

			gate.pending = { message, priority };
			if (gate.timeout === undefined) {
				gate.timeout = setTimeout(
					() => flushPending(gate),
					ANNOUNCE_RATE_LIMIT_MS - (now - gate.lastWrittenAt),
				);
			}
		},
		dispose() {
			if (disposed) {
				return;
			}
			disposed = true;
			for (const gate of gates.values()) {
				if (gate.timeout !== undefined) {
					clearTimeout(gate.timeout);
					gate.timeout = undefined;
				}
			}
			gates.clear();
			region?.remove();
		},
	};
}

function write(
	region: HTMLElement | null,
	message: string,
	priority: AnnouncerPriority,
): void {
	if (region === null) {
		return;
	}
	// wave-3-adopt: schedule this write in DomScheduler.write when wired
	region.setAttribute("aria-live", priority);
	// wave-3-adopt: schedule this write in DomScheduler.write when wired
	region.textContent = "";
	region.textContent = message;
}

function createLiveRegion(doc: Document, root?: ParentNode): HTMLElement | null {
	const mount = resolveMount(root, doc);
	if (mount === undefined) {
		return null;
	}

	const region = doc.createElement("div");
	// wave-3-exempt: construction of the live region, not a scheduled paint write
	region.setAttribute("role", "status");
	region.setAttribute("aria-live", "polite");
	// ARIA boolean: literal "true". `aria-atomic=""` is invalid.
	region.setAttribute("aria-atomic", "true");
	hideVisually(region);
	mount.appendChild(region);
	return region;
}

function hideVisually(element: HTMLElement): void {
	element.style.position = "absolute";
	element.style.width = "1px";
	element.style.height = "1px";
	element.style.padding = "0";
	element.style.margin = "-1px";
	element.style.overflow = "hidden";
	element.style.clip = "rect(0 0 0 0)";
	element.style.whiteSpace = "nowrap";
	element.style.border = "0";
}

function resolveDocument(root?: ParentNode): Document | undefined {
	if (root === undefined) {
		const doc = (globalThis as { document?: Document }).document;
		return typeof doc?.createElement === "function" ? doc : undefined;
	}
	if (root.nodeType === 9) {
		return root as Document;
	}
	return root.ownerDocument ?? undefined;
}

function resolveMount(
	root: ParentNode | undefined,
	doc: Document,
): ParentNode | undefined {
	if (root !== undefined && root.nodeType !== 9) {
		return root;
	}
	return doc.body ?? doc.documentElement ?? undefined;
}
