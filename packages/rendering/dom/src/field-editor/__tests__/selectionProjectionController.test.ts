import { describe, expect, it } from "vitest";
import { HistorySelectionCoordinator } from "../historySelectionCoordinator";
import { SelectionProjectionController } from "../selectionProjectionController";

function createController() {
	const setTextSelection: Array<{
		blockId: string;
		anchorOffset: number;
		focusOffset: number;
	}> = [];
	const controller = new SelectionProjectionController({
		historySelectionCoordinator: new HistorySelectionCoordinator({
			facet: () => undefined as never,
		}),
		isEditing: () => true,
		getMode: () => "single",
		getFocusBlockId: () => "first",
		getAttachedElement: () => null,
		getRootElement: () => null,
		findExpandedHost: () => null,
		resolveInlineElement: () => null,
		attachElement: () => false,
		requestDomFocus: () => false,
		updateBackendSelection: () => {},
		setTextSelection: (blockId, anchorOffset, focusOffset) => {
			setTextSelection.push({ blockId, anchorOffset, focusOffset });
		},
		activate: () => {},
		emitSelectionProjected: () => {},
	});
	return { controller, setTextSelection };
}

describe("SelectionProjectionController shouldIgnoreDomTextSelection", () => {
	it("ignores leftover native range on the first block after a programmatic enter split", () => {
		const { controller } = createController();
		controller.commitProgrammaticTextSelection("inserted", 0, 0);

		expect(
			controller.shouldIgnoreDomTextSelection(
				{ blockId: "first", offset: 5 },
				{ blockId: "first", offset: 5 },
			),
		).toBe(true);
	});
});
