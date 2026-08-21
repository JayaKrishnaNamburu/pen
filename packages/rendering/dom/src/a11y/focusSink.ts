/**
 * AX1 hidden focus sink (`03-selection.md` §5.4).
 *
 * Hidden from AT and out of tab order unless holding block/cell
 * selection; then role + label.
 *
 * Overlay (AX7) stays presentation. The sink is the accessible
 * selection surface for block and cell selections.
 *
 * wave-3-exempt: every hide/reveal write and the construction marker
 * are focus-target ARIA, not paint. They must already be true when
 * focus can land on the sink (Wave 5 §5.4). Scheduling them in
 * DomScheduler.write would desync AT from the focused element — a
 * deferred hide leaves the sink in the tab order after the user has
 * moved on; a deferred reveal can focus an unlabeled, still-hidden
 * element. Inventory for Wave 3.4 is `rg 'wave-3-(adopt|exempt)'` —
 * adopt converts, exempt leaves. Do not mark these adopt: converting
 * them later would be the wrong fix.
 */

export const FOCUS_SINK_ATTR = "data-pen-focus-sink";

export type FocusSinkKind = "block" | "cell";

export interface FocusSinkReveal {
	kind: FocusSinkKind;
	label: string;
}

export interface FocusSink {
	readonly element: HTMLElement;
	hide(): void;
	reveal(selection: FocusSinkReveal): void;
	dispose(): void;
}

const BLOCK_ROLE = "group";
const CELL_ROLE = "grid";

export function createFocusSink(doc: Document = document): FocusSink {
	const element = doc.createElement("div");
	// wave-3-exempt: construction marker, not a scheduled paint write
	element.setAttribute(FOCUS_SINK_ATTR, "");
	hideSink(element);

	return {
		element,
		hide() {
			hideSink(element);
		},
		reveal(selection) {
			revealSink(element, selection);
		},
		dispose() {
			element.remove();
		},
	};
}

function hideSink(element: HTMLElement): void {
	// wave-3-exempt: the whole hide body — aria-hidden, tabIndex, and
	// role/label removal — must be synchronous with focus. Deferring it
	// leaves assistive tech on a still-visible, still-tabbable element.
	// Sanctioned because this is the focus sink, not visible content; the
	// value is the literal "true" (AX1), since [aria-hidden=""] matches nothing.
	element.setAttribute("aria-hidden", "true");
	element.tabIndex = -1;
	element.removeAttribute("role");
	element.removeAttribute("aria-label");
}

function revealSink(element: HTMLElement, selection: FocusSinkReveal): void {
	// wave-3-exempt: entire reveal body — tabIndex, role, label, and
	// aria-hidden removal must be true before focus can land
	element.tabIndex = 0;
	element.role = selection.kind === "cell" ? CELL_ROLE : BLOCK_ROLE;
	element.setAttribute("aria-label", selection.label);
	element.removeAttribute("aria-hidden");
}
