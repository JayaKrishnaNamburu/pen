/**
 * AX1 hidden focus sink (`03-selection.md` §5.4).
 *
 * Hidden from AT and out of tab order unless holding block/cell
 * selection; then role + label.
 *
 * Overlay (AX7) stays presentation. The sink is the accessible
 * selection surface for block and cell selections.
 *
 * wave-3-exempt at every setAttribute here — but not for one reason.
 * Hide and reveal are focus-target ARIA and must already be true when
 * focus can land on the sink (Wave 5 §5.4). Construction is a data-*
 * identity marker, AT-neutral; it is exempt because it must be
 * queryable in the same turn as appendChild, not because AT reads it.
 * Marking any of the three for scheduler adoption would be the
 * wrong conversion: scheduling hide/reveal desyncs AT from the
 * focused element, and scheduling the marker makes same-turn
 * `[data-pen-focus-sink]` queries miss.
 *
 * Wave 3.4 inventory is `rg 'wave-3-(adopt|exempt)'` across a11y/.
 * The adopt token alone is not the inventory — it misses these
 * exempt writes and would convert only the announcer.
 *
 * Three setAttribute sites, all exempt, each judged separately:
 * 1. construction — `data-pen-focus-sink=""` (data-*, bare presence)
 * 2. hide — `aria-hidden="true"` (ARIA boolean literal, not `=""`)
 * 3. reveal — `aria-label` (string). `aria-hidden` is removed, not
 *    set false-y.
 *
 * ARIA booleans stay the literal strings "true"/"false". The
 * data-* present/absent spelling must not be extended here:
 * `aria-hidden=""` is invalid, and `[aria-hidden=""]` matches nothing.
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
	// wave-3-exempt: data-* identity, AT-neutral. Must be set before
	// appendChild so same-turn [data-pen-focus-sink] queries find it.
	// Adopt would schedule a construction marker — the wrong conversion.
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
	// wave-3-exempt: focus sink hide body — aria-hidden, tabIndex, and
	// role/label removal — runs in the same selectionChange turn as
	// leaving block/cell selection. Deferring it to DomScheduler.write
	// leaves AT on a still-labeled, still-tabbable group/grid after the
	// user has moved on. Wave 5 §5.4 also moves focus off the sink in
	// this turn. Value is the literal "true" (AX1);
	// [aria-hidden=""] matches nothing.
	element.setAttribute("aria-hidden", "true");
	element.tabIndex = -1;
	element.removeAttribute("role");
	element.removeAttribute("aria-label");
}

function revealSink(element: HTMLElement, selection: FocusSinkReveal): void {
	// wave-3-exempt: entire reveal body — tabIndex, role, label, and
	// aria-hidden removal must already be true when Wave 5 §5.4
	// focuses the sink. A scheduled reveal can focus an unlabeled,
	// still-hidden element; AT would observe the wrong surface.
	element.tabIndex = 0;
	element.role = selection.kind === "cell" ? CELL_ROLE : BLOCK_ROLE;
	element.setAttribute("aria-label", selection.label);
	element.removeAttribute("aria-hidden");
}
