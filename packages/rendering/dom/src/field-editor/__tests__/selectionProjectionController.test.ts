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

	it("does not clear lastProjectedVersion on reset", () => {
		const { controller } = createController();
		controller.recordProjectedVersion(9);
		controller.reset();
		expect(controller.lastProjectedVersion).toBe(9);
		expect(controller.peekProgrammaticTextSelection()).toBeNull();
	});

	it("keeps the leftover-ignore stamp across a session-switch reset", () => {
		const { controller } = createController();
		controller.commitProgrammaticTextSelection("inserted", 0, 0);
		const stamp = controller.peekProgrammaticTextSelection();
		expect(stamp?.blockId).toBe("inserted");

		controller.reset();
		expect(
			controller.shouldIgnoreDomTextSelection(
				{ blockId: "first", offset: 5 },
				{ blockId: "first", offset: 5 },
			),
		).toBe(false);

		controller.restoreProgrammaticTextSelection(stamp!);
		expect(
			controller.shouldIgnoreDomTextSelection(
				{ blockId: "first", offset: 5 },
				{ blockId: "first", offset: 5 },
			),
		).toBe(true);
	});
});
