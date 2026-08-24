import { yjsAdapter } from "@input/pen-crdt-yjs";
import type { DiagnosticEvent } from "@input/pen-types";
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

function storedBlockText(
	adapter: ReturnType<typeof yjsAdapter>,
	editor: ReturnType<typeof createHeadlessEditor>,
	blockId: string,
): string {
	const ydoc = adapter.raw<Y.Doc>(editor.internals.crdtDoc);
	const blockMap = (ydoc.getMap("blocks") as RawBlocksMap).get(blockId);
	const content = blockMap?.get("content") as Y.Text | undefined;
	return content?.toString() ?? "";
}

function applyRemoteText(
	adapter: ReturnType<typeof yjsAdapter>,
	editor: ReturnType<typeof createHeadlessEditor>,
	blockId: string,
	text: string,
): void {
	const remote = adapter.loadDocument(adapter.encodeState(editor.internals.crdtDoc));
	const ydoc = adapter.raw<Y.Doc>(remote);
	ydoc.transact(() => {
		const blockMap = (ydoc.getMap("blocks") as RawBlocksMap).get(blockId);
		const content = blockMap?.get("content") as Y.Text | undefined;
		content?.delete(0, content.length);
		if (text.length > 0) {
			content?.insert(0, text);
		}
	});
	adapter.applyUpdate(editor.internals.crdtDoc, adapter.encodeState(remote));
}

describe("empty blocks EM4", () => {
	it("EM4: stamp-2-shaped remote lone zwsp is stripped with sentinel-stripped", () => {
		const adapter = yjsAdapter();
		const editor = createHeadlessEditor({
			crdt: adapter,
			schema: createDefaultSchema(),
			preset: noDefaultExtensionsPreset,
		});
		const blockId = editor.firstBlock()!.id;
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		applyRemoteText(adapter, editor, blockId, "\u200B");

		expect(storedBlockText(adapter, editor, blockId)).toBe("");
		expect(editor.getBlock(blockId)?.textContent()).toBe("");
		expect(diagnostics.some((event) => event.code === "sentinel-stripped")).toBe(
			true,
		);

		editor.destroy();
	});

	it("EM4: embedded U+200B in longer text is preserved byte-for-byte", () => {
		const adapter = yjsAdapter();
		const editor = createHeadlessEditor({
			crdt: adapter,
			schema: createDefaultSchema(),
			preset: noDefaultExtensionsPreset,
		});
		const keepId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "mid",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);

		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		applyRemoteText(adapter, editor, keepId, "keep\u200Bme");
		applyRemoteText(adapter, editor, "mid", "a\u200Bb");

		expect(storedBlockText(adapter, editor, keepId)).toBe("keep\u200Bme");
		expect(storedBlockText(adapter, editor, "mid")).toBe("a\u200Bb");
		expect(editor.getBlock(keepId)?.textContent()).toBe("keep\u200Bme");
		expect(editor.getBlock("mid")?.textContent()).toBe("a\u200Bb");
		expect(diagnostics.some((event) => event.code === "sentinel-stripped")).toBe(
			false,
		);

		editor.destroy();
	});
});
