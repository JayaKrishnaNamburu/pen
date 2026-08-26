import { describe, expect, it } from "vitest";
import type { Editor } from "@input/pen-types";
import {
	selectionSnapshotMatches,
	snapshotTransferSelection,
	type TransferSelectionSnapshot,
} from "../transferSelection";

function editorWithSelection(selection: unknown): Editor {
	return { selection } as Editor;
}

describe("transfer selection snapshot equality", () => {
	it("SCALE2: matches a text snapshot even when key order differs", () => {
		const editor = editorWithSelection({
			type: "text",
			anchor: { blockId: "block-1", offset: 1 },
			focus: { blockId: "block-1", offset: 4 },
		});
		const snapshot: TransferSelectionSnapshot = {
			focus: { offset: 4, blockId: "block-1" },
			type: "text",
			anchor: { offset: 1, blockId: "block-1" },
		};

		expect(
			JSON.stringify(snapshotTransferSelection(editor)) ===
				JSON.stringify(snapshot),
		).toBe(false);
		expect(selectionSnapshotMatches(editor, snapshot)).toBe(true);
	});

	it("SCALE2: still rejects a moved caret", () => {
		const editor = editorWithSelection({
			type: "text",
			anchor: { blockId: "block-1", offset: 1 },
			focus: { blockId: "block-1", offset: 4 },
		});

		expect(
			selectionSnapshotMatches(editor, {
				type: "text",
				anchor: { blockId: "block-1", offset: 1 },
				focus: { blockId: "block-1", offset: 5 },
			}),
		).toBe(false);
	});

	it("SCALE2: matches block ids in order and rejects a permutation", () => {
		const editor = editorWithSelection({
			type: "block",
			blockIds: ["a", "b"],
		});

		expect(
			selectionSnapshotMatches(editor, {
				type: "block",
				blockIds: ["a", "b"],
			}),
		).toBe(true);
		expect(
			selectionSnapshotMatches(editor, {
				type: "block",
				blockIds: ["b", "a"],
			}),
		).toBe(false);
	});

	it("SCALE2: treats a cleared selection as a mismatch", () => {
		const editor = editorWithSelection(null);

		expect(
			selectionSnapshotMatches(editor, {
				type: "app",
				appId: "app-1",
			}),
		).toBe(false);
		expect(selectionSnapshotMatches(editor, null)).toBe(true);
	});
});
