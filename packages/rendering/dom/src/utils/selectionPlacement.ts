import { isCollapsed } from "@input/pen-core";
import type { SelectionState } from "@input/pen-types";
import { measureWithRoot } from "../geometry/rootGeometry";
import { rectToDOMRect, unionRects } from "../geometry/types";

export function resolveSelectionRect(
	root: HTMLElement,
	selection: SelectionState | null,
): DOMRect | null {
	if (!selection || selection.type !== "text" || isCollapsed(selection)) {
		return null;
	}

	return measureWithRoot(root, ({ reader }) => {
		const rangeRects = reader.rangeRects({
			anchor: selection.anchor,
			focus: selection.focus,
		});
		if (rangeRects.length > 0) {
			const merged = unionRects(rangeRects);
			if (merged.width === 0 && merged.height === 0) {
				return null;
			}
			return rectToDOMRect(merged);
		}

		const anchorRect = reader.caretRect(selection.anchor, "downstream");
		const focusRect = reader.caretRect(selection.focus, "downstream");
		if (!anchorRect || !focusRect) {
			return null;
		}
		return rectToDOMRect(unionRects([anchorRect, focusRect]));
	});
}
