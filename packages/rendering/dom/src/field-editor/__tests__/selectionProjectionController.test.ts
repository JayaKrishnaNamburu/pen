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

function createController(
	initialRecord: SelectionRecord | null = null,
	overrides: {
		resolveInlineElement?: () => HTMLElement | null;
		attachElement?: () => boolean;
		requestDomFocus?: () => boolean;
		emitDiagnostic?: (event: { code: string }) => void;
	} = {},
) {
	const setTextSelection: Array<{
		blockId: string;
		anchorOffset: number;
		focusOffset: number;
	}> = [];
	const diagnostics: Array<{ code: string }> = [];
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
		resolveInlineElement: overrides.resolveInlineElement ?? (() => null),
		attachElement: overrides.attachElement ?? (() => false),
		requestDomFocus: overrides.requestDomFocus ?? (() => false),
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
		emitDiagnostic: (event) => {
			diagnostics.push(event);
			overrides.emitDiagnostic?.(event);
		},
	});
	return { controller, setTextSelection, diagnostics };
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

describe("SelectionProjectionController park diagnostics", () => {
	it("does not invent selection-target-unmounted for a virtualized unmount", () => {
		const { controller, diagnostics } = createController(
			programmaticRecord("first", 0, 0, 4),
		);

		controller.syncDomSelectionOnce();
		controller.syncDomSelectionOnce();

		expect(controller.parkedProjectionVersion).toBe(4);
		expect(diagnostics.map((event) => event.code)).toEqual([]);
	});

	it("emits selection-target-unmounted once when the target is present but projection fails", () => {
		const target = { isConnected: true } as HTMLElement;
		const { controller, diagnostics } = createController(
			programmaticRecord("first", 0, 0, 7),
			{
				resolveInlineElement: () => target,
				attachElement: () => false,
				requestDomFocus: () => false,
			},
		);

		controller.syncDomSelectionOnce();
		controller.syncDomSelectionOnce();

		expect(controller.parkedProjectionVersion).toBe(7);
		expect(
			diagnostics.filter(
				(event) => event.code === "selection-target-unmounted",
			),
		).toHaveLength(1);
	});
});
