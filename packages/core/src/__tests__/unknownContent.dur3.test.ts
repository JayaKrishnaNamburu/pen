import { initBlockMap, yjsAdapter } from "@input/pen-crdt-yjs";
import { createDefaultSchema } from "@input/pen-schema-default";
import type { CRDTDocument, DiagnosticEvent, Editor } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createHeadlessEditor } from "../index";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

type RawBlocksMap = Y.Map<Y.Map<unknown>>;

function createEditor(document: CRDTDocument, adapter = yjsAdapter()) {
	return createHeadlessEditor({
		crdt: adapter,
		document,
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
	});
}

function storedProps(
	adapter: ReturnType<typeof yjsAdapter>,
	doc: CRDTDocument,
	blockId: string,
): Record<string, unknown> {
	const ydoc = adapter.raw<Y.Doc>(doc);
	const blockMap = (ydoc.getMap("blocks") as RawBlocksMap).get(blockId);
	const props = blockMap?.get("props") as Y.Map<unknown> | undefined;
	const result: Record<string, unknown> = {};
	props?.forEach((value, key) => {
		result[key] = value;
	});
	return result;
}

function storedDeltas(
	adapter: ReturnType<typeof yjsAdapter>,
	doc: CRDTDocument,
	blockId: string,
): Array<{ insert: string | object; attributes?: Record<string, unknown> }> {
	const ydoc = adapter.raw<Y.Doc>(doc);
	const blockMap = (ydoc.getMap("blocks") as RawBlocksMap).get(blockId);
	const content = blockMap?.get("content") as Y.Text | undefined;
	return content?.toDelta() ?? [];
}

function snapshotBlocks(editor: Editor) {
	return [...editor.documentState.allBlocks()].map((block) => ({
		id: block.id,
		type: block.type,
		props: { ...block.props },
		content: block.textContent(),
		deltas: block.textDeltas(),
	}));
}

function populateUnknownDocument(adapter: ReturnType<typeof yjsAdapter>) {
	const crdtDoc = adapter.createDocument();
	const ydoc = adapter.raw<Y.Doc>(crdtDoc);
	const blocks = ydoc.getMap("blocks") as RawBlocksMap;
	const blockOrder = ydoc.getArray<string>("blockOrder");

	adapter.transact(crdtDoc, () => {
		initBlockMap(blocks, "p1", "paragraph", "inline");
		const paragraph = blocks.get("p1")!;
		(paragraph.get("props") as Y.Map<unknown>).set("futureNote", "keep");
		const content = paragraph.get("content") as Y.Text;
		content.insert(0, "Hello world");
		content.format(0, 5, { mysteryMark: "keep", bold: true });

		initBlockMap(blocks, "h1", "heading", "inline");
		const headingDefault = blocks.get("h1")!;
		(headingDefault.get("props") as Y.Map<unknown>).set("level", 1);
		(headingDefault.get("props") as Y.Map<unknown>).set("futureFlag", true);

		initBlockMap(blocks, "h2", "heading", "inline");
		(blocks.get("h2")!.get("props") as Y.Map<unknown>).set("level", 2);

		for (const id of ["w1", "w2", "w3"]) {
			initBlockMap(blocks, id, "futureWidget", "inline");
			const widget = blocks.get(id)!;
			(widget.get("props") as Y.Map<unknown>).set("payload", id);
			(widget.get("content") as Y.Text).insert(0, `widget-${id}`);
		}

		initBlockMap(blocks, "c1", "futureCallout", "inline");
		(blocks.get("c1")!.get("props") as Y.Map<unknown>).set("tone", "alert");
		(blocks.get("c1")!.get("content") as Y.Text).insert(0, "callout");

		blockOrder.push(["p1", "h1", "h2", "w1", "w2", "w3", "c1"]);
	});

	return crdtDoc;
}

function rehydrateFromJson(
	json: string,
	adapter: ReturnType<typeof yjsAdapter>,
): CRDTDocument {
	const parsed = JSON.parse(json) as ReturnType<typeof snapshotBlocks>;
	const crdtDoc = adapter.createDocument();
	const ydoc = adapter.raw<Y.Doc>(crdtDoc);
	const blocks = ydoc.getMap("blocks") as RawBlocksMap;
	const blockOrder = ydoc.getArray<string>("blockOrder");

	adapter.transact(crdtDoc, () => {
		for (const block of parsed) {
			initBlockMap(blocks, block.id, block.type, "inline");
			const blockMap = blocks.get(block.id)!;
			const props = blockMap.get("props") as Y.Map<unknown>;
			for (const [key, value] of Object.entries(block.props)) {
				props.set(key, value);
			}
			const content = blockMap.get("content") as Y.Text;
			if (block.deltas.length > 0) {
				for (const delta of block.deltas) {
					content.insert(content.length, delta.insert);
				}
				let offset = 0;
				for (const delta of block.deltas) {
					if (delta.attributes) {
						content.format(offset, delta.insert.length, delta.attributes);
					}
					offset += delta.insert.length;
				}
			} else if (block.content) {
				content.insert(0, block.content);
			}
			blockOrder.push([block.id]);
		}
	});

	return crdtDoc;
}

function schemaUnknownDiagnostics(events: DiagnosticEvent[]) {
	return events.filter((event) => event.code === "schema-unknown-block");
}

describe("DUR3 unknown-content preservation", () => {
	it("DUR3: both registry factories resolve unknown types via passthrough", () => {
		const published = createDefaultSchema();

		expect(published.resolve("futureWidget")?.type).toBe("futureWidget");
		expect(published.allBlocks().some((schema) => schema.type === "futureWidget")).toBe(
			false,
		);
	});

	it("DUR3: stripDefaultProps only strips values equal to current defaults", () => {
		const adapter = yjsAdapter();
		const document = populateUnknownDocument(adapter);
		const editor = createEditor(document, adapter);

		editor.normalizeAll();

		expect(storedProps(adapter, editor.internals.crdtDoc, "h1")).toEqual({
			futureFlag: true,
		});
		expect(storedProps(adapter, editor.internals.crdtDoc, "h2")).toEqual({
			level: 2,
		});
		expect(editor.getBlock("h1")?.props.level).toBe(1);
		expect(editor.getBlock("h1")?.props.futureFlag).toBe(true);

		editor.destroy();
	});

	it("DUR3: unknown marks are not stripped", () => {
		const adapter = yjsAdapter();
		const document = populateUnknownDocument(adapter);
		const editor = createEditor(document, adapter);

		editor.normalizeAll();

		const deltas = storedDeltas(adapter, editor.internals.crdtDoc, "p1");
		expect(deltas.length).toBeGreaterThanOrEqual(2);
		expect(deltas[0]?.attributes).toMatchObject({
			mysteryMark: "keep",
			bold: true,
		});

		editor.destroy();
	});

	it("DUR3: existing unknown content is preserved but insert-block of unknown type is refused", () => {
		const adapter = yjsAdapter();
		const document = populateUnknownDocument(adapter);
		const editor = createEditor(document, adapter);
		const diagnostics: DiagnosticEvent[] = [];

		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		expect(editor.getBlock("w1")?.type).toBe("futureWidget");
		expect(editor.getBlock("w1")?.props.payload).toBe("w1");

		editor.apply([
			{
				type: "insert-block",
				blockId: "w-new",
				blockType: "futureWidget",
				props: { payload: "new" },
				position: "last",
			},
		]);

		expect(editor.getBlock("w-new")).toBeNull();
		expect(editor.getBlock("w1")?.type).toBe("futureWidget");
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_APPLY_002",
				source: "apply",
			}),
		);

		editor.destroy();
	});

	it("DUR3: unknown types, props, and marks survive load → normalize → encode → copy → JSON export/import with one diagnostic per type", () => {
		const adapter = yjsAdapter();
		const document = populateUnknownDocument(adapter);
		const editor = createEditor(document, adapter);
		const diagnostics: DiagnosticEvent[] = [];

		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		editor.normalizeAll();
		editor.apply([
			{
				type: "set-meta",
				blockId: "p1",
				namespace: "dur3",
				data: { observed: true },
			},
		]);

		const unknownTypes = schemaUnknownDiagnostics(diagnostics).map(
			(event) => event.blockType,
		);
		expect(unknownTypes.sort()).toEqual(["futureCallout", "futureWidget"]);

		const before = snapshotBlocks(editor);
		expect(before.find((block) => block.id === "p1")?.props.futureNote).toBe(
			"keep",
		);
		expect(
			before.find((block) => block.id === "p1")?.deltas[0]?.attributes,
		).toMatchObject({
			mysteryMark: "keep",
			bold: true,
		});
		expect(before.filter((block) => block.type === "futureWidget")).toHaveLength(
			3,
		);
		expect(before.find((block) => block.id === "c1")?.props.tone).toBe("alert");

		const encoded = adapter.encodeState(editor.internals.crdtDoc);
		const loaded = adapter.loadDocument(encoded);
		const loadedEditor = createEditor(loaded, adapter);
		loadedEditor.normalizeAll();
		expect(snapshotBlocks(loadedEditor)).toEqual(before);

		const copied = adapter.loadDocument(
			adapter.encodeState(loadedEditor.internals.crdtDoc),
		);
		const copiedEditor = createEditor(copied, adapter);
		copiedEditor.normalizeAll();
		expect(snapshotBlocks(copiedEditor)).toEqual(before);

		const json = JSON.stringify(before);
		const imported = rehydrateFromJson(json, adapter);
		const importedEditor = createEditor(imported, adapter);
		importedEditor.normalizeAll();
		expect(snapshotBlocks(importedEditor)).toEqual(before);

		importedEditor.apply([
			{
				type: "insert-block",
				blockId: "from-json",
				blockType: "futureWidget",
				props: { payload: "from-json" },
				position: "last",
			},
		]);
		expect(importedEditor.getBlock("from-json")).toBeNull();
		expect(importedEditor.getBlock("w2")?.props.payload).toBe("w2");

		editor.destroy();
		loadedEditor.destroy();
		copiedEditor.destroy();
		importedEditor.destroy();
	});
});
