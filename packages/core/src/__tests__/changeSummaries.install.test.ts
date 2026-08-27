import { isYjsCRDTDocument, yjsAdapter } from "@input/pen-yjs";
import type { CommitEvent } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
	affectedBlockIdsFromSummary,
	applySplitBlock,
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
			{
				type: "splice-text",
				blockId: "b1",
				from: 0,
				to: 0,
				insert: "meadow sage",
			},
		]);
		editor.selectText("b1", 9, 9);
		applySplitBlock(editor, {
			blockId: "b1",
			offset: 6,
			newBlockId: "b2",
		});
		const summary = editor.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(summary!.structural).toContainEqual({
			type: "block-split",
			blockId: "b1",
			newBlockId: "b2",
			offset: 6,
		});
		expect(
			summary!.structural.some(
				(change) => change.type === "block-inserted",
			),
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
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "hello",
			},
		]);

		const summary = editor.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(
			summary!.blockText.length === 0 && summary!.structural.length === 0,
		).toBe(false);
		expect(
			summary!.blockText.some((change) => change.blockId === blockId),
		).toBe(true);
		expect(editor.getBlock(blockId)?.textContent()).toBe("hello");

		editor.destroy();
	});

	it("I10: normalize stays inside the same apply summary", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		const before = editor.lastChangeSummary?.commitId ?? 0;

		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "Hi",
			},
		]);

		const summary = editor.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(summary!.commitId).toBe(before + 1);
		expect(
			summary!.blockText.some((change) => change.blockId === blockId),
		).toBe(true);

		editor.destroy();
	});

	it("a later out-of-apply text change is not emitted as an empty summary", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const first = editor.firstBlock()!.id;
		const second = "second-block";
		editor.apply([
			{
				type: "splice-text",
				blockId: first,
				from: 0,
				to: 0,
				insert: "First",
			},
			{
				type: "insert-block",
				blockId: second,
				blockType: "paragraph",
				props: {},
				position: { after: first },
			},
			{
				type: "splice-text",
				blockId: second,
				from: 0,
				to: 0,
				insert: "Second",
			},
		]);
		editor.apply(
			[
				{
					type: "splice-text",
					blockId: second,
					from: 6,
					to: 6,
					insert: "!",
				},
			],
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
		expect(
			summary!.blockText.length === 0 && summary!.structural.length === 0,
		).toBe(false);
		expect(affectedBlockIdsFromSummary(summary!)).toContain(second);
		expect(commits).toHaveLength(1);
		expect(
			commits[0]!.summary.blockText.length === 0 &&
				commits[0]!.summary.structural.length === 0,
		).toBe(false);
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
			{
				type: "splice-text",
				blockId: first,
				from: 0,
				to: 0,
				insert: "First",
			},
			{
				type: "insert-block",
				blockId: second,
				blockType: "paragraph",
				props: {},
				position: { after: first },
			},
			{
				type: "splice-text",
				blockId: second,
				from: 0,
				to: 0,
				insert: "Second",
			},
		]);

		const undo = editor.internals.adapter.createUndoManager(
			editor.internals.crdtDoc,
			{ captureTimeout: 0 },
		);
		editor.apply(
			[
				{
					type: "splice-text",
					blockId: second,
					from: 6,
					to: 6,
					insert: "!",
				},
			],
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
		expect(
			summary!.blockText.length === 0 && summary!.structural.length === 0,
		).toBe(false);
		expect(affectedBlockIdsFromSummary(summary!)).toContain(second);
		expect(commits.length).toBeGreaterThan(0);
		const undoCommit = commits[commits.length - 1]!;
		expect(
			undoCommit.summary.blockText.length === 0 &&
				undoCommit.summary.structural.length === 0,
		).toBe(false);
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
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "hello",
			},
		]);
		const first = editor.lastChangeSummary;
		expect(first).not.toBeNull();
		expect(
			first!.blockText.length === 0 && first!.structural.length === 0,
		).toBe(false);

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
		expect(second!.blockText).toEqual([]);
		expect(second!.structural).toEqual([]);
		expect(second!.affectedBlockIds).toEqual([]);

		editor.destroy();
	});

	it("seeds the shadow index from an existing document", () => {
		const adapter = yjsAdapter();
		const document = adapter.createDocument();
		const writer = createHeadlessEditor({
			schema: defaultSchema,
			crdt: adapter,
			document,
		});
		const blockId = writer.firstBlock()!.id;
		writer.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "hello",
			},
		]);

		const reader = createHeadlessEditor({
			schema: defaultSchema,
			crdt: adapter,
			document,
		});
		expect(reader.getBlock(blockId)?.textContent()).toBe("hello");

		reader.apply([
			{
				type: "splice-text",
				blockId,
				from: 5,
				to: 5,
				insert: "!",
			},
		]);

		const summary = reader.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(
			summary!.blockText.some((change) => change.blockId === blockId),
		).toBe(true);
		expect(reader.getBlock(blockId)?.textContent()).toBe("hello!");

		writer.destroy();
		reader.destroy();
	});

	it("reseeds the shadow index after loadDocument", async () => {
		const adapter = yjsAdapter();
		const writer = createHeadlessEditor({
			schema: defaultSchema,
			crdt: adapter,
		});
		const blockId = writer.firstBlock()!.id;
		writer.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "hello",
			},
		]);
		const loaded = adapter.loadDocument(
			adapter.encodeState(writer.internals.crdtDoc),
		);

		const reader = createHeadlessEditor({
			schema: defaultSchema,
			crdt: adapter,
		});
		reader.loadDocument(loaded);
		await flushMicrotasks();

		const loadedBlockId = reader.firstBlock()!.id;
		expect(reader.getBlock(loadedBlockId)?.textContent()).toBe("hello");

		reader.apply([
			{
				type: "splice-text",
				blockId: loadedBlockId,
				from: 5,
				to: 5,
				insert: "!",
			},
		]);

		const summary = reader.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(
			summary!.blockText.some(
				(change) => change.blockId === loadedBlockId,
			),
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
				type: "splice-text",
				blockId: "host4-table",
				cell: { row: 1, col: 0 },
				from: 0,
				to: 0,
				insert: "Cell before",
			},
		]);
		const insertSummary = editor.lastChangeSummary;
		expect(insertSummary).not.toBeNull();
		expect(insertSummary!.blockText.length).toBeGreaterThan(0);
		expect(affectedBlockIdsFromSummary(insertSummary!)).toContain(
			"host4-table",
		);
		expect(
			editor
				.getBlock("host4-table")
				?.as("table")
				?.tableCell(1, 0)
				?.textContent(),
		).toBe("Cell before");

		editor.apply([
			{
				type: "splice-text",
				blockId: "host4-table",
				cell: { row: 1, col: 0 },
				from: 0,
				to: 11,
				insert: "",
			},
		]);
		const deleteSummary = editor.lastChangeSummary;
		expect(deleteSummary).not.toBeNull();
		expect(deleteSummary!.blockText).not.toEqual([]);
		expect(affectedBlockIdsFromSummary(deleteSummary!)).toContain(
			"host4-table",
		);
		expect(
			editor
				.getBlock("host4-table")
				?.as("table")
				?.tableCell(1, 0)
				?.textContent(),
		).toBe("");

		editor.destroy();
	});

	it("OB1: live convert-block is block-props-changed with type in keys", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "set-props",
				blockId,
				props: { type: "heading", ...{ level: 1 } },
			},
		]);
		const change = editor.lastChangeSummary?.structural.find(
			(item) => item.type === "block-props-changed",
		);
		expect(change?.type).toBe("block-props-changed");
		if (change?.type === "block-props-changed") {
			expect(change.keys).toContain("type");
		}
		editor.destroy();
	});
});
