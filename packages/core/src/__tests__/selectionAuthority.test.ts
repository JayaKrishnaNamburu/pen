import type { DiagnosticEvent, SelectionState, TextSelection } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { createBlockIndexSnapshot } from "../changes/blockIndex";
import { createChangeSummary } from "../changes/mapping";
import { createEditor as createCoreEditor } from "../index";
import type { SelectionAuthorityImpl } from "../editor/selection";
import { getSelectionBlockRange } from "../selection/helpers";
import { createDefaultSchema } from "./fixtures/testSchema";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createEditor() {
	return createCoreEditor({
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
	});
}

type EditorRuntime = {
	_selection: SelectionAuthorityImpl;
	_doc: Parameters<SelectionAuthorityImpl["updateDocument"]>[0];
	_crdtDoc: Parameters<SelectionAuthorityImpl["updateDocument"]>[1];
};

function runtimeOf(editor: ReturnType<typeof createEditor>): EditorRuntime {
	return editor as unknown as EditorRuntime;
}

function authorityOf(editor: ReturnType<typeof createEditor>): SelectionAuthorityImpl {
	return runtimeOf(editor)._selection;
}

function textPayload(
	anchor: { blockId: string; offset: number },
	focus = anchor,
): TextSelection {
	return {
		type: "text",
		anchor,
		focus,
		isCollapsed: false,
		isMultiBlock: false,
		blockRange: [anchor.blockId],
		toRange: () => {
			throw new Error("test payload");
		},
	};
}

describe("SelectionAuthority A1–A6", () => {
	it("A1: N1 inline embeds occupy one logical offset and are not clamped away", () => {
		const editor = createEditor();
		const id = editor.firstBlock()!.id;
		editor.apply([
			{ type: "insert-text", blockId: id, offset: 0, text: "ab" },
			{
				type: "insert-inline-node",
				blockId: id,
				offset: 2,
				nodeType: "mention",
				props: { id: "1", label: "Ada" },
			},
		]);
		editor.selectText(id, 3, 3);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: id, offset: 3 },
			focus: { blockId: id, offset: 3 },
		});
		editor.destroy();
	});

	it("A1: a caret in a new empty paragraph lands at logical 0, not 1", () => {
		const editor = createEditor();
		const id = editor.firstBlock()!.id;
		editor.selectTextRange(
			{ blockId: id, offset: 1 },
			{ blockId: id, offset: 1 },
		);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: id, offset: 0 },
			focus: { blockId: id, offset: 0 },
		});
		editor.destroy();
	});

	it("A1: both endpoints are validated and a missing block is rejected with a diagnostic", () => {
		const editor = createEditor();
		const id = editor.firstBlock()!.id;
		editor.selectText(id, 0, 0);
		const before = editor.selection;
		const version = authorityOf(editor).record.version;
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		editor.setSelection(
			textPayload(
				{ blockId: id, offset: 0 },
				{ blockId: "missing-focus", offset: 0 },
			),
		);

		expect(editor.selection).toBe(before);
		expect(authorityOf(editor).record.version).toBe(version);
		expect(
			diagnostics.some((event) => event.code === "selection-invalid-block"),
		).toBe(true);
		editor.destroy();
	});

	it("A2: a deep-equal state with a different goalX does not move the version", () => {
		const editor = createEditor();
		const id = editor.firstBlock()!.id;
		editor.apply([
			{ type: "insert-text", blockId: id, offset: 0, text: "hello" },
		]);
		editor.selectText(id, 2, 2);
		const version = authorityOf(editor).record.version;
		const changes: SelectionState[] = [];
		editor.on("selectionChange", (selection) => {
			changes.push(selection);
		});

		const current = editor.selection as TextSelection;
		editor.setSelection({
			...current,
			goalX: 144,
		});

		expect(authorityOf(editor).record.version).toBe(version);
		expect(changes).toEqual([]);
		editor.destroy();
	});

	it("A2: a different affinity is a write", () => {
		const editor = createEditor();
		const id = editor.firstBlock()!.id;
		editor.selectText(id, 0, 0);
		const version = authorityOf(editor).record.version;
		const current = editor.selection as TextSelection;
		editor.setSelection({
			...current,
			affinity: "upstream",
		});
		expect(authorityOf(editor).record.version).toBe(version + 1);
		expect((editor.selection as TextSelection).affinity).toBe("upstream");
		editor.destroy();
	});

	it("A4: origin gc is rejected with a diagnostic", () => {
		const editor = createEditor();
		const id = editor.firstBlock()!.id;
		editor.selectText(id, 0, 0);
		const version = authorityOf(editor).record.version;
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		authorityOf(editor).set(null, { origin: "gc" });

		expect(editor.selection).not.toBeNull();
		expect(authorityOf(editor).record.version).toBe(version);
		expect(
			diagnostics.some((event) => event.code === "selection-reserved-origin"),
		).toBe(true);
		editor.destroy();
	});

	it("A5: caret stays collapsed through mapRange on an insert at 0", () => {
		const editor = createEditor();
		const id = editor.firstBlock()!.id;
		editor.apply([
			{ type: "insert-text", blockId: id, offset: 0, text: "meadow sage" },
		]);
		editor.selectText(id, 4, 4);
		const summary = createChangeSummary({
			commitId: 99,
			originType: "user",
			text: [
				{
					blockId: id,
					splices: [{ from: 0, to: 0, insertLength: 5 }],
					formatRanges: [],
				},
			],
			structural: [],
			index: createBlockIndexSnapshot({
				roots: [id],
				lengthById: { [id]: "meadow sage".length },
				typeById: { [id]: "paragraph" },
			}),
		});
		const mapped = summary.mapRange({
			anchor: { blockId: id, offset: 4 },
			focus: { blockId: id, offset: 4 },
		});
		authorityOf(editor).onCommit(summary);
		expect(mapped).toEqual({
			anchor: { blockId: id, offset: 9 },
			focus: { blockId: id, offset: 9 },
		});
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: id, offset: 9 },
			focus: { blockId: id, offset: 9 },
		});
		expect(authorityOf(editor).record.origin).toBe("mapped");
		editor.destroy();
	});

	it("A5: deleting the selected block via apply maps the caret instead of leaving a dangling id", () => {
		const editor = createEditor();
		const initial = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "keep",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "insert-text", blockId: "keep", offset: 0, text: "stay" },
		]);
		editor.selectText(initial, 0, 0);
		editor.apply([{ type: "delete-block", blockId: initial }]);

		expect(editor.getBlock(initial)).toBeNull();
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: "keep" },
			focus: { blockId: "keep" },
		});
		expect(authorityOf(editor).record.origin).toBe("mapped");
		editor.destroy();
	});

	it("A5: an identity map leaves the version untouched", () => {
		const editor = createEditor();
		const id = editor.firstBlock()!.id;
		editor.selectText(id, 0, 0);
		const version = authorityOf(editor).record.version;
		authorityOf(editor).onCommit(
			createChangeSummary({
				commitId: 7,
				originType: "user",
				text: [],
				structural: [],
				index: createBlockIndexSnapshot({
					roots: [id],
					lengthById: { [id]: 0 },
					typeById: { [id]: "paragraph" },
				}),
			}),
		);
		expect(authorityOf(editor).record.version).toBe(version);
		editor.destroy();
	});

	it("A5: mapped writes emit selectionChange after commit listeners", () => {
		const editor = createEditor();
		const id = editor.firstBlock()!.id;
		editor.apply([{ type: "insert-text", blockId: id, offset: 0, text: "Hello" }]);
		editor.selectText(id, 2, 2);
		const order: string[] = [];
		editor.on("selectionChange", () => {
			order.push("selection");
		});
		editor.on("commit", () => {
			order.push("commit");
		});
		editor.apply([{ type: "insert-text", blockId: id, offset: 0, text: "xxx" }]);
		expect(order).toEqual(["commit", "selection"]);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: id, offset: 5 },
			focus: { blockId: id, offset: 5 },
		});
		expect(authorityOf(editor).record.origin).toBe("mapped");
		editor.destroy();
	});

	it("A6: updateDocument writes null, increments version, and emits", () => {
		const editor = createEditor();
		const id = editor.firstBlock()!.id;
		editor.selectText(id, 0, 0);
		const auth = authorityOf(editor);
		const version = auth.record.version;
		const changes: SelectionState[] = [];
		editor.on("selectionChange", (selection) => {
			changes.push(selection);
		});

		auth.updateDocument(runtimeOf(editor)._doc, runtimeOf(editor)._crdtDoc);

		expect(editor.selection).toBeNull();
		expect(auth.record.version).toBe(version + 1);
		expect(auth.record.origin).toBe("programmatic");
		expect(changes).toEqual([null]);
		editor.destroy();
	});

	it("command-path selections keep affinity and head", () => {
		const editor = createEditor();
		const first = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "second",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		editor.apply([
			{ type: "insert-text", blockId: first, offset: 0, text: "hello" },
		]);
		editor.selectText(first, 2, 2);
		editor.selectAll();
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: first, offset: 0 },
			focus: { blockId: first, offset: 5 },
			affinity: "downstream",
		});
		editor.selectAll();
		expect(editor.selection).toMatchObject({
			type: "block",
			blockIds: [first, "second"],
			head: "second",
		});
		editor.destroy();
	});

	it("helpers recompute blockRange from the document and ignore a stamped lie", () => {
		const editor = createEditor();
		const first = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "b",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		const lying: TextSelection = {
			type: "text",
			anchor: { blockId: first, offset: 0 },
			focus: { blockId: "b", offset: 0 },
			isCollapsed: true,
			isMultiBlock: false,
			blockRange: [first],
			toRange: () => {
				throw new Error("unused");
			},
		};
		expect(getSelectionBlockRange(runtimeOf(editor)._doc, lying)).toEqual([
			first,
			"b",
		]);
		editor.destroy();
	});
});
