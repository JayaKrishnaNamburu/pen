/**
 * AX1 hidden focus sink (`03-selection.md` §5.4).
 *
 * Hidden from AT and out of tab order unless holding block/cell
 * selection; then role + label.
 *
 * Overlay (AX7) stays presentation. The sink is the accessible
 * selection surface for block and cell selections.
 *
 * wave-3-exempt: the setAttribute writes below are focus-target ARIA,
 * not paint. They must already be true when focus can land on the
 * sink (Wave 5 §5.4). Scheduling them in DomScheduler.write would
 * desync AT from the focused element. Inventory for Wave 3.4 is
 * `rg 'wave-3-(adopt|exempt)'` — adopt converts, exempt leaves.
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
	// focus sink — hidden until it holds block/cell selection
	// wave-3-exempt: hide/reveal ARIA must be synchronous with focus
	element.setAttribute("aria-hidden", "true");
	element.tabIndex = -1;
	element.removeAttribute("role");
	element.removeAttribute("aria-label");
}

function revealSink(element: HTMLElement, selection: FocusSinkReveal): void {
	element.tabIndex = 0;
	element.role = selection.kind === "cell" ? CELL_ROLE : BLOCK_ROLE;
	// wave-3-exempt: hide/reveal ARIA must be synchronous with focus
	element.setAttribute("aria-label", selection.label);
	element.removeAttribute("aria-hidden");
}
