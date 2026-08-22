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
	it("ignores leftover native range on another block after a programmatic stamp", () => {
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

describe("SelectionProjectionController gesture windows", () => {
	it("opens the pointer window on beginPointerSelection and keeps it open after end", () => {
		const { controller } = createController();
		expect(controller.isAdmissibleGestureRead()).toBe(false);
		controller.beginPointerSelection();
		expect(controller.isAdmissibleGestureRead()).toBe(true);
		controller.endPointerSelection();
		expect(controller.isAdmissibleGestureRead()).toBe(true);
	});

	it("step 4: shouldSuppressSelectionSync is dead", () => {
		const { controller } = createController();
		expect(controller.shouldSuppressSelectionSync()).toBe(false);
	});

	it("step 4: consumeDomSelectionProjectionSuppression is dead", () => {
		const { controller } = createController();
		controller.suppressNextDomSelectionProjection();
		expect(controller.consumeDomSelectionProjectionSuppression()).toBe(
			false,
		);
	});
});
