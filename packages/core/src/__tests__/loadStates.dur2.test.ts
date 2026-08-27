import {
	initBlockMap,
	yjsAdapter,
	type YjsCRDTDocument,
} from "@input/pen-yjs";
import { describe, expect, it } from "vitest";

import { createDefaultSchema } from "./fixtures/testSchema";
import { createHeadlessEditor } from "../index";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

async function flushMicrotasks(count = 2): Promise<void> {
	for (let index = 0; index < count; index++) {
		await Promise.resolve();
	}
}

function seedParagraph(
	adapter: ReturnType<typeof yjsAdapter>,
	blockId: string,
): YjsCRDTDocument {
	const doc = adapter.createDocument() as YjsCRDTDocument;
	adapter.transact(doc, () => {
		initBlockMap(doc.penDocument.blocks, blockId, "paragraph", "inline");
		doc.penDocument.blockOrder.push([blockId]);
	});
	return doc;
}

describe("editor load recovery events (DUR2)", () => {
	it("DUR2: editor.loadDocument emits crdt:recovered after a repaired load", async () => {
		const adapter = yjsAdapter();
		const source = seedParagraph(adapter, "b1");
		source.ydoc.transact(() => {
			source.penDocument.blockOrder.push(["b1"]);
		});
		const loaded = adapter.loadDocument(adapter.encodeState(source));

		const editor = createHeadlessEditor({
			crdt: adapter,
			schema: createDefaultSchema(),
			preset: noDefaultExtensionsPreset,
		});
		const recovered: string[] = [];
		editor.on("crdt:recovered", (method) => {
			recovered.push(method);
		});

		editor.loadDocument(loaded);
		await flushMicrotasks(8);

		expect(recovered).toEqual(["repair"]);
		expect(editor.getBlock("b1")?.type).toBe("paragraph");

		editor.destroy();
	});

	it("DUR2: editor.loadDocument does not emit crdt:recovered for an ok load", async () => {
		const adapter = yjsAdapter();
		const source = seedParagraph(adapter, "b1");
		const loaded = adapter.loadDocument(adapter.encodeState(source));

		const editor = createHeadlessEditor({
			crdt: adapter,
			schema: createDefaultSchema(),
			preset: noDefaultExtensionsPreset,
		});
		const recovered: string[] = [];
		editor.on("crdt:recovered", (method) => {
			recovered.push(method);
		});

		editor.loadDocument(loaded);
		await flushMicrotasks(8);

		expect(recovered).toEqual([]);
		expect(editor.getBlock("b1")?.type).toBe("paragraph");

		editor.destroy();
	});
});
