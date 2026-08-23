import { describe, expect, it } from "vitest";
import type { SelectionRecord } from "@input/pen-types";
import { HistorySelectionCoordinator } from "../historySelectionCoordinator";
import { SelectionProjectionController } from "../selectionProjectionController";

function programmaticRecord(
	blockId: string,
	anchorOffset: number,
	focusOffset: number,
	version = 1,
): SelectionRecord {
	return {
		state: {
			type: "text",
			anchor: { blockId, offset: anchorOffset },
			focus: { blockId, offset: focusOffset },
			affinity: "downstream",
			goalX: null,
		},
		version,
		origin: "programmatic",
		commitId: 0,
	};
}

function createController(initialRecord: SelectionRecord | null = null) {
	const setTextSelection: Array<{
		blockId: string;
		anchorOffset: number;
		focusOffset: number;
	}> = [];
	let record = initialRecord;
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
			record = programmaticRecord(
				blockId,
				anchorOffset,
				focusOffset,
				(record?.version ?? 0) + 1,
			);
		},
		activate: () => {},
		emitSelectionProjected: () => {},
		getRecord: () => record,
	});
	return { controller, setTextSelection };
}

describe("SelectionProjectionController shouldIgnoreDomTextSelection", () => {
	it("ignores leftover native range on another block after a programmatic record write", () => {
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
	});

	it("keeps leftover-ignore across a session-switch reset because it reads the record", () => {
		const { controller } = createController();
		controller.commitProgrammaticTextSelection("inserted", 0, 0);

		controller.reset();
		expect(
			controller.shouldIgnoreDomTextSelection(
				{ blockId: "first", offset: 5 },
				{ blockId: "first", offset: 5 },
			),
		).toBe(true);
	});

	it("does not ignore leftover ranges while a pointer window is open", () => {
		const { controller } = createController();
		controller.commitProgrammaticTextSelection("inserted", 0, 0);
		controller.beginPointerSelection();
		expect(
			controller.shouldIgnoreDomTextSelection(
				{ blockId: "first", offset: 5 },
				{ blockId: "first", offset: 5 },
			),
		).toBe(false);
	});
});

describe("SelectionProjectionController resolveProgrammaticInputRange", () => {
	it("returns the record caret when the live range is a stale collapse", () => {
		const { controller } = createController();
		controller.commitProgrammaticTextSelection("hello", 3, 3);

		expect(
			controller.resolveProgrammaticInputRange("hello", {
				start: 11,
				end: 11,
			}),
		).toEqual({ start: 3, end: 3 });
		expect(
			controller.resolveProgrammaticInputRange("hello", {
				start: 3,
				end: 3,
			}),
		).toBeNull();
		expect(
			controller.resolveProgrammaticInputRange("other", {
				start: 11,
				end: 11,
			}),
		).toBeNull();
	});

	it("consumes a record version after one input resolve so the next keystroke uses live", () => {
		const { controller } = createController();
		controller.commitProgrammaticTextSelection("hello", 0, 0);

		expect(
			controller.resolveProgrammaticInputRange("hello", {
				start: 0,
				end: 0,
			}),
		).toBeNull();
		expect(
			controller.resolveProgrammaticInputRange("hello", {
				start: 2,
				end: 2,
			}),
		).toEqual({ start: 0, end: 0 });
		expect(
			controller.resolveProgrammaticInputRange("hello", {
				start: 2,
				end: 2,
			}),
		).toBeNull();

		controller.commitProgrammaticTextSelection("hello", 1, 1);
		expect(
			controller.resolveProgrammaticInputRange("hello", {
				start: 2,
				end: 2,
			}),
		).toEqual({ start: 1, end: 1 });
	});

	it("does not override live after activate without a programmatic commit", () => {
		const { controller } = createController();
		controller.activateTextSelection("hello", 0, 0);
		expect(
			controller.resolveProgrammaticInputRange("hello", {
				start: 5,
				end: 5,
			}),
		).toBeNull();
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
