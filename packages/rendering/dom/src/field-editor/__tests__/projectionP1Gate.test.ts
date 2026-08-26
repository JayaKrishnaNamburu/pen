// @vitest-environment jsdom

import { createEditor, getEditorSelectionRecord } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import type { SelectionRecord } from "@input/pen-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRootGeometry } from "../../geometry/rootGeometry";
import { FieldEditorImpl } from "../fieldEditorImpl";

let frameQueue: FrameRequestCallback[] = [];

function installMockRaf(): void {
	frameQueue = [];
	vi.stubGlobal(
		"requestAnimationFrame",
		(callback: FrameRequestCallback): number => {
			frameQueue.push(callback);
			return frameQueue.length;
		},
	);
}

function flushFrame(): void {
	const batch = frameQueue.splice(0);
	for (const callback of batch) {
		callback(0);
	}
}

class ProbeFieldEditor extends FieldEditorImpl {
	skipBackendWrite: boolean[] = [];
	echoSkipBackendWrite: boolean[] = [];

	protected override _recomputeSurfaceFromSelection(options?: {
		syncSelectionToBackend?: boolean;
		skipBackendWrite?: boolean;
	}): void {
		this.skipBackendWrite.push(options?.skipBackendWrite === true);
		super._recomputeSurfaceFromSelection(options);
	}

	protected override _projectFromScheduler(record: SelectionRecord): void {
		super._projectFromScheduler(record);
		this._selectionCoordinator.recordProjectedVersion(record.version);
		this.skipBackendWrite = [];
		this._editor.internals.emit(
			"selectionChange",
			getEditorSelectionRecord(this._editor)!,
		);
		this.echoSkipBackendWrite = [...this.skipBackendWrite];
	}

	get lastProjectedVersion(): number {
		return this._selectionCoordinator.lastProjectedVersion;
	}

	setLastProjectedVersion(version: number): void {
		this._selectionCoordinator.recordProjectedVersion(version);
	}
}

const fixtures: Array<{
	editor: ReturnType<typeof createEditor>;
	fieldEditor: ProbeFieldEditor;
	root: HTMLElement;
}> = [];

afterEach(() => {
	while (fixtures.length > 0) {
		const fixture = fixtures.pop();
		if (!fixture) {
			break;
		}
		fixture.fieldEditor.destroy();
		fixture.root.remove();
		fixture.editor.destroy();
	}
	vi.unstubAllGlobals();
});

describe("P1 double-write gate", () => {
	beforeEach(() => {
		installMockRaf();
	});

	it("does not skip the v1 backend write when P1 did not deliver", () => {
		const editor = createEditor({ schema: defaultSchema });
		const fieldEditor = new ProbeFieldEditor(editor);
		const root = document.createElement("div");
		document.body.appendChild(root);
		fixtures.push({ editor, fieldEditor, root });
		fieldEditor.setRootElement(root);

		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "Hi",
			},
		]);
		editor.selectText(blockId, 0, 0);
		fieldEditor.skipBackendWrite = [];
		editor.selectText(blockId, 2, 2);

		const { scheduler } = getRootGeometry(root);
		expect(scheduler.projectedThisFlush).toBe(false);
		expect(scheduler.phase).toBe("idle");
		expect(fieldEditor.skipBackendWrite).toEqual([true, false]);
	});

	it("skips the v1 backend write when the scheduler slot ran this flush", () => {
		const editor = createEditor({ schema: defaultSchema });
		const fieldEditor = new ProbeFieldEditor(editor);
		const root = document.createElement("div");
		document.body.appendChild(root);
		fixtures.push({ editor, fieldEditor, root });
		fieldEditor.setRootElement(root);

		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "Hi",
			},
		]);
		editor.selectText(blockId, 2, 2);
		flushFrame();

		const { scheduler } = getRootGeometry(root);
		expect(scheduler.projectedThisFlush).toBe(true);
		expect(fieldEditor.echoSkipBackendWrite.every((skip) => skip)).toBe(
			true,
		);
		expect(fieldEditor.echoSkipBackendWrite.length).toBeGreaterThan(0);
	});

	it("keeps lastProjectedVersion across a session switch", () => {
		const editor = createEditor({ schema: defaultSchema });
		const fieldEditor = new ProbeFieldEditor(editor);
		const root = document.createElement("div");
		document.body.appendChild(root);
		fixtures.push({ editor, fieldEditor, root });
		fieldEditor.setRootElement(root);

		const firstBlockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "second",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		fieldEditor.activate(firstBlockId);
		fieldEditor.setLastProjectedVersion(4);

		fieldEditor.activate("second");
		expect(fieldEditor.lastProjectedVersion).toBe(4);
	});
});
