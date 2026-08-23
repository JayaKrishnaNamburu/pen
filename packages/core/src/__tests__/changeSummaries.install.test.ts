import { isYjsCRDTDocument, yjsAdapter } from "@input/pen-crdt-yjs";
import type { CommitEvent } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
	affectedBlockIdsFromSummary,
	createHeadlessEditor,
} from "../index";
import { defaultSchema } from "./fixtures/testSchema";

async function flushMicrotasks(count = 4): Promise<void> {
	for (let index = 0; index < count; index++) {
		await Promise.resolve();
	}
}

describe("change summaries — editor install", () => {
	it("copy-split stamps a block-split recipe after same-apply insert-block+text", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const seed = editor.firstBlock()!.id;
		editor.apply([{ type: "delete-block", blockId: seed }]);
		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "insert-text", blockId: "b1", offset: 0, text: "meadow sage" },
		]);
		editor.selectText("b1", 9, 9);
		editor.apply([
			{
				type: "split-block",
				blockId: "b1",
				offset: 6,
				newBlockId: "b2",
			},
		]);
		const summary = editor.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(summary!.structural).toContainEqual({
			type: "block-split",
			blockId: "b1",
			newBlockId: "b2",
			offset: 6,
		});
		expect(
			summary!.structural.some((change) => change.type === "block-inserted"),
		).toBe(false);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: "b2", offset: 3 },
			focus: { blockId: "b2", offset: 3 },
		});
		editor.destroy();
	});

	it("emits a summary for apply with text splices", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "hello",
			},
		]);

		const summary = editor.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(summary!.isEmpty).toBe(false);
		expect(summary!.text.some((change) => change.blockId === blockId)).toBe(
			true,
		);
		expect(editor.getBlock(blockId)?.textContent()).toBe("hello");

		editor.destroy();
	});

	it("I10: normalize stays inside the same apply summary", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		const before = editor.lastChangeSummary?.commitId ?? 0;

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "Hi",
			},
		]);

		const summary = editor.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(summary!.commitId).toBe(before + 1);
		expect(summary!.text.some((change) => change.blockId === blockId)).toBe(
			true,
		);

		editor.destroy();
	});

	it("a later out-of-apply text change is not emitted as an empty summary", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const first = editor.firstBlock()!.id;
		const second = "second-block";
		editor.apply([
			{ type: "insert-text", blockId: first, offset: 0, text: "First" },
			{
				type: "insert-block",
				blockId: second,
				blockType: "paragraph",
				props: {},
				position: { after: first },
			},
			{ type: "insert-text", blockId: second, offset: 0, text: "Second" },
		]);
		editor.apply(
			[{ type: "insert-text", blockId: second, offset: 6, text: "!" }],
			{ origin: "user" },
		);
		expect(editor.getBlock(second)?.textContent()).toBe("Second!");

		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});

		const doc = editor.internals.crdtDoc;
		if (!isYjsCRDTDocument(doc)) {
			throw new Error("expected a yjs document");
		}
		const content = doc.penDocument.blocks.get(second)?.get("content");
		if (!(content instanceof Y.Text)) {
			throw new Error("expected yjs text content");
		}
		content.delete(6, 1);

		expect(editor.getBlock(second)?.textContent()).toBe("Second");
		const summary = editor.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(summary!.isEmpty).toBe(false);
		expect(affectedBlockIdsFromSummary(summary!)).toContain(second);
		expect(commits).toHaveLength(1);
		expect(commits[0]!.summary.isEmpty).toBe(false);
		expect(affectedBlockIdsFromSummary(commits[0]!.summary)).toContain(
			second,
		);

		editor.destroy();
	});

	it("undo of a later text insert is not emitted as an empty summary", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const first = editor.firstBlock()!.id;
		const second = "second-block";
		editor.apply([
			{ type: "insert-text", blockId: first, offset: 0, text: "First" },
			{
				type: "insert-block",
				blockId: second,
				blockType: "paragraph",
				props: {},
				position: { after: first },
			},
			{ type: "insert-text", blockId: second, offset: 0, text: "Second" },
		]);

		const undo = editor.internals.adapter.createUndoManager(
			editor.internals.crdtDoc,
			{ captureTimeout: 0 },
		);
		editor.apply(
			[{ type: "insert-text", blockId: second, offset: 6, text: "!" }],
			{ origin: "user" },
		);
		undo.stopCapturing();
		expect(editor.getBlock(second)?.textContent()).toBe("Second!");

		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});

		expect(undo.undo()).toBe(true);
		expect(editor.getBlock(second)?.textContent()).toBe("Second");

		const summary = editor.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(summary!.isEmpty).toBe(false);
		expect(affectedBlockIdsFromSummary(summary!)).toContain(second);
		expect(commits.length).toBeGreaterThan(0);
		const undoCommit = commits[commits.length - 1]!;
		expect(undoCommit.summary.isEmpty).toBe(false);
		expect(affectedBlockIdsFromSummary(undoCommit.summary)).toContain(
			second,
		);

		undo.destroy();
		editor.destroy();
	});

	it("OB5: a CRDT event without a fresh builder output does not reuse the previous summary", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "hello",
			},
		]);
		const first = editor.lastChangeSummary;
		expect(first).not.toBeNull();
		expect(first!.isEmpty).toBe(false);

		const runtime = editor as unknown as {
			_pendingSummary: unknown;
			_dispatchCRDTEvent: (event: {
				origin: string;
				affectedBlocks: string[];
				ops: unknown[];
				timestamp: number;
			}) => void;
		};
		runtime._pendingSummary = null;
		runtime._dispatchCRDTEvent({
			origin: "system",
			affectedBlocks: [],
			ops: [],
			timestamp: Date.now(),
		});

		const second = editor.lastChangeSummary;
		expect(second).not.toBeNull();
		expect(second).not.toBe(first);
		expect(second!.commitId).toBe((first?.commitId ?? 0) + 1);
		expect(second!.isEmpty).toBe(true);
		expect(second!.text).toEqual([]);
		expect(second!.structural).toEqual([]);

		editor.destroy();
	});

	it("seeds the shadow index from an existing document", () => {
		const adapter = yjsAdapter();
		const document = adapter.createDocument();
		const writer = createHeadlessEditor({ schema: defaultSchema,  crdt: adapter, document });
		const blockId = writer.firstBlock()!.id;
		writer.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "hello",
			},
		]);

		const reader = createHeadlessEditor({ schema: defaultSchema,  crdt: adapter, document });
		expect(reader.getBlock(blockId)?.textContent()).toBe("hello");

		reader.apply([
			{
				type: "insert-text",
				blockId,
				offset: 5,
				text: "!",
			},
		]);

		const summary = reader.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(summary!.text.some((change) => change.blockId === blockId)).toBe(
			true,
		);
		expect(reader.getBlock(blockId)?.textContent()).toBe("hello!");

		writer.destroy();
		reader.destroy();
	});

	it("reseeds the shadow index after loadDocument", async () => {
		const adapter = yjsAdapter();
		const writer = createHeadlessEditor({ schema: defaultSchema,  crdt: adapter });
		const blockId = writer.firstBlock()!.id;
		writer.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "hello",
			},
		]);
		const loaded = adapter.loadDocument(
			adapter.encodeState(writer.internals.crdtDoc),
		);

		const reader = createHeadlessEditor({ schema: defaultSchema,  crdt: adapter });
		reader.loadDocument(loaded);
		await flushMicrotasks();

		const loadedBlockId = reader.firstBlock()!.id;
		expect(reader.getBlock(loadedBlockId)?.textContent()).toBe("hello");

		reader.apply([
			{
				type: "insert-text",
				blockId: loadedBlockId,
				offset: 5,
				text: "!",
			},
		]);

		const summary = reader.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(
			summary!.text.some((change) => change.blockId === loadedBlockId),
		).toBe(true);
		expect(reader.getBlock(loadedBlockId)?.textContent()).toBe("hello!");

		writer.destroy();
		reader.destroy();
	});

	it("emits a text change when emptying a nested table cell", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		editor.apply([
			{
				type: "insert-block",
				blockId: "host4-toggle",
				blockType: "toggle",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "host4-table",
				blockType: "table",
				props: {},
				position: { parent: "host4-toggle", index: 0 },
			},
		]);
		expect(editor.documentState.blockOrder).not.toContain("host4-table");
		expect(editor.getBlock("host4-table")).not.toBeNull();

		editor.apply([
			{
				type: "insert-table-cell-text",
				blockId: "host4-table",
				row: 1,
				col: 0,
				offset: 0,
				text: "Cell before",
			},
		]);
		const insertSummary = editor.lastChangeSummary;
		expect(insertSummary).not.toBeNull();
		expect(insertSummary!.text.length).toBeGreaterThan(0);
		expect(affectedBlockIdsFromSummary(insertSummary!)).toContain(
			"host4-table",
		);
		expect(
			editor.getBlock("host4-table")?.as("table")?.tableCell(1, 0)?.textContent(),
		).toBe("Cell before");

		editor.apply([
			{
				type: "delete-table-cell-text",
				blockId: "host4-table",
				row: 1,
				col: 0,
				offset: 0,
				length: 11,
			},
		]);
		const deleteSummary = editor.lastChangeSummary;
		expect(deleteSummary).not.toBeNull();
		expect(deleteSummary!.text).not.toEqual([]);
		expect(affectedBlockIdsFromSummary(deleteSummary!)).toContain(
			"host4-table",
		);
		expect(
			editor.getBlock("host4-table")?.as("table")?.tableCell(1, 0)?.textContent(),
		).toBe("");

		editor.destroy();
	});
});
