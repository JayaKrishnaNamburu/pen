import {
	getDocumentLoadReport,
	initBlockMap,
	readFormatStamp,
	yjsAdapter,
} from "@input/pen-crdt-yjs";
import { PEN_FORMAT_METADATA_KEY } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createHeadlessEditor } from "../editor/editor";
import { createDefaultSchema } from "./fixtures/testSchema";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

type RawBlocksMap = Y.Map<Y.Map<unknown>>;

function storedBlockText(ydoc: Y.Doc, blockId: string): string {
	const blockMap = (ydoc.getMap("blocks") as RawBlocksMap).get(blockId);
	const content = blockMap?.get("content") as Y.Text | undefined;
	return content?.toString() ?? "";
}

function storedCellText(ydoc: Y.Doc, blockId: string): string {
	const blockMap = (ydoc.getMap("blocks") as RawBlocksMap).get(blockId);
	const table = blockMap?.get("tableContent") as
		| Y.Array<Y.Map<unknown>>
		| undefined;
	const row = table?.get(0);
	const cells = row?.get("cells") as Y.Array<Y.Map<unknown>> | undefined;
	const cell = cells?.get(0);
	const content = cell?.get("content") as Y.Text | undefined;
	return content?.toString() ?? "";
}

function seedStamp2SentinelDocument() {
	const adapter = yjsAdapter();
	const doc = adapter.createDocument();
	const ydoc = adapter.raw<Y.Doc>(doc);
	ydoc.transact(() => {
		const blocks = ydoc.getMap("blocks") as RawBlocksMap;
		const blockOrder = ydoc.getArray<string>("blockOrder");
		const metadata = ydoc.getMap("metadata");
		initBlockMap(blocks, "p1", "paragraph", "inline");
		initBlockMap(blocks, "p2", "paragraph", "inline");
		initBlockMap(blocks, "t1", "table", "table");
		(blocks.get("p1")!.get("content") as Y.Text).insert(0, "\u200B");
		(blocks.get("p2")!.get("content") as Y.Text).insert(0, "\u200B");
		const table = blocks.get("t1")!.get("tableContent") as Y.Array<
			Y.Map<unknown>
		>;
		const row = table.get(0)!;
		const cells = row.get("cells") as Y.Array<Y.Map<unknown>>;
		(cells.get(0)!.get("content") as Y.Text).insert(0, "\u200B");
		blockOrder.push(["p1", "p2", "t1"]);
		metadata.set(PEN_FORMAT_METADATA_KEY, {
			format: 2,
			minReader: 1,
			writer: "0.0.1",
		});
	});
	expect(readFormatStamp(doc).format).toBe(2);
	expect(storedBlockText(ydoc, "p1")).toBe("\u200B");
	return { adapter, binary: adapter.encodeState(doc) };
}

describe("empty blocks EM3", () => {
	it("EM3 EM8: stamp-2 corpus loads to stamp 3 with asserted strip counts", () => {
		const { adapter, binary } = seedStamp2SentinelDocument();
		const loaded = adapter.loadDocument(binary);
		const editor = createHeadlessEditor({
			crdt: adapter,
			document: loaded,
			schema: createDefaultSchema(),
			preset: noDefaultExtensionsPreset,
		});

		expect(readFormatStamp(editor.internals.crdtDoc).format).toBe(3);
		expect(
			getDocumentLoadReport(editor.internals.crdtDoc)
				?.strippedSentinelCount,
		).toBe(3);
		expect(editor.getBlock("p1")?.textContent()).toBe("");
		expect(editor.getBlock("p2")?.textContent()).toBe("");
		const ydoc = adapter.raw<Y.Doc>(editor.internals.crdtDoc);
		expect(storedBlockText(ydoc, "p1")).toBe("");
		expect(storedBlockText(ydoc, "p2")).toBe("");
		expect(storedCellText(ydoc, "t1")).toBe("");

		const second = createHeadlessEditor({
			crdt: adapter,
			document: adapter.loadDocument(
				adapter.encodeState(editor.internals.crdtDoc),
			),
			schema: createDefaultSchema(),
			preset: noDefaultExtensionsPreset,
		});
		expect(readFormatStamp(second.internals.crdtDoc).format).toBe(3);
		expect(
			getDocumentLoadReport(second.internals.crdtDoc)
				?.strippedSentinelCount ?? 0,
		).toBe(0);
		expect(second.getBlock("p1")?.textContent()).toBe("");
		expect(
			storedBlockText(adapter.raw<Y.Doc>(second.internals.crdtDoc), "p1"),
		).toBe("");

		editor.destroy();
		second.destroy();
	});
});
