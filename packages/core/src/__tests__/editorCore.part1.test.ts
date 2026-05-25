import { yjsAdapter } from "@pen/crdt-yjs";
import { processStream } from "@pen/delta-stream";
import { inputRulesExtension } from "@pen/input-rules";
import { undoExtension } from "@pen/undo";
import {
	defineExtension,
	type DocumentSession,
	type PenStreamPart,
	getOpOriginType,
} from "@pen/types";
import { describe, expect, it, vi } from "vitest";

import {
	createDecorationSet,
	createDocumentSession,
	createEditor as createCoreEditor,
	createHeadlessEditor,
	ensureInlineCompletionController,
} from "../index";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const undoOnlyPreset = {
	resolve() {
		return { extensions: [undoExtension()] };
	},
};

function createEditor(options: Parameters<typeof createCoreEditor>[0] = {}) {
	return createCoreEditor({
		...options,
		preset: options.preset ?? noDefaultExtensionsPreset,
	});
}

function createDefaultEditor(
	options: Parameters<typeof createCoreEditor>[0] = {},
) {
	return createCoreEditor(options);
}

function createEditorWithUndo(
	options: Parameters<typeof createCoreEditor>[0] = {},
) {
	return createCoreEditor({
		...options,
		preset: options.preset ?? undoOnlyPreset,
	});
}

async function* createStream(parts: PenStreamPart[]) {
	for (const part of parts) {
		yield part;
	}
}

async function flushMicrotasks(count = 2): Promise<void> {
	for (let index = 0; index < count; index++) {
		await Promise.resolve();
	}
}

function visibleText(text: string): string {
	return text.replace(/\u200B/g, "");
}

type TestYTextLike = {
	insert(offset: number, text: string): void;
};

type TestBlockMapLike = {
	get(key: string): unknown;
};

type TestBlocksMapLike = {
	get(key: string): TestBlockMapLike | undefined;
};

type TestRawDocLike = {
	getMap(name: "blocks"): TestBlocksMapLike;
};

type TestTableRowLike = {
	get(field: "cells"): { delete(index: number, length: number): void };
};

type TestTableContentLike = {
	get(index: number): TestTableRowLike;
};


describe("@pen/core createEditor", () => {
	it("warns once when using the deprecated without option", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const editor = createCoreEditor({
			without: ["document-ops"],
		});
		editor.destroy();

		expect(warnSpy).toHaveBeenCalledWith(
			"Pen: createEditor({ without }) is deprecated. Prefer createEditor({ preset: defaultPreset(...) }) for default feature composition.",
		);

		warnSpy.mockRestore();
	});

	it("installs extensions from presets before user extensions", () => {
		const editor = createEditor({
			preset: {
				resolve() {
					return {
						extensions: [
							defineExtension({
								name: "preset-test-extension",
								activateClient: async (ctx) => {
									ctx.editor.internals.setSlot(
										"test:preset-installed",
										true,
									);
								},
							}),
						],
					};
				},
			},
		});

		expect(editor.internals.getSlot("test:preset-installed")).toBe(true);

		editor.destroy();
	});

	it("supports multiple editors sharing one document session", () => {
		const session = createDocumentSession({
			adapter: yjsAdapter(),
		});
		const editorA = createEditor({
			documentSession: session,
		});
		const editorB = createEditor({
			documentSession: session,
		});
		const blockId = editorA.firstBlock()!.id;

		editorA.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "Shared",
			},
		]);

		expect(editorB.getBlock(blockId)?.textContent()).toBe("Shared");
		expect(editorA.documentScope.id).toBe(editorB.documentScope.id);
		expect(editorA.internals.documentSession).toBe(session);
		expect(editorB.internals.documentSession).toBe(session);

		editorA.destroy();
		editorB.apply([
			{
				type: "insert-text",
				blockId,
				offset: 6,
				text: " doc",
			},
		]);

		expect(editorB.getBlock(blockId)?.textContent()).toBe("Shared doc");

		editorB.destroy();
		session.destroy();
	});

	it("creates headless editors around caller-owned documents without default undo behavior", () => {
		const adapter = yjsAdapter();
		const document = adapter.createDocument();
		const editor = createHeadlessEditor({ crdt: adapter, document });
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "Server edit",
			},
		]);

		expect(editor.getBlock(blockId)?.textContent()).toBe("Server edit");
		expect(editor.undoManager.undo()).toBe(false);

		editor.destroy();
	});

	it("does not destroy caller-owned documents on editor teardown", () => {
		const adapter = yjsAdapter();
		const document = adapter.createDocument();
		const editorA = createEditor({
			document,
		});
		const blockId = editorA.firstBlock()!.id;

		editorA.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "Persisted",
			},
		]);
		editorA.destroy();

		const editorB = createEditor({
			document,
		});

		expect(editorB.getBlock(blockId)?.textContent()).toBe("Persisted");

		editorB.destroy();
	});

	it("persists document profile metadata for new editors", () => {
		const editor = createEditor({
			documentProfile: "flow",
		});

		expect(editor.documentProfile).toBe("flow");
		expect(editor.documentState.documentProfile).toBe("flow");
		expect(editor.editorViewMode).toBe("flow");
		expect(
			editor.internals.adapter.getDocumentProfile?.(
				editor.internals.crdtDoc,
			),
		).toBe("flow");

		editor.destroy();
	});

	it("loads persisted document profile independently from local editor view mode", () => {
		const adapter = yjsAdapter();
		const document = adapter.createDocument();
		adapter.setDocumentProfile?.(document, "flow");

		const editor = createEditor({
			document,
			editorViewMode: "structured",
		});

		expect(editor.documentProfile).toBe("flow");
		expect(editor.documentState.documentProfile).toBe("flow");
		expect(editor.editorViewMode).toBe("structured");

		editor.destroy();
	});

	it("keeps document profile in sync with persisted metadata changes", () => {
		const adapter = yjsAdapter();
		const document = adapter.createDocument();
		const editor = createEditor({
			document,
		});

		expect(editor.documentProfile).toBe("structured");
		expect(editor.documentState.documentProfile).toBe("structured");

		adapter.setDocumentProfile?.(document, "flow");

		expect(editor.documentProfile).toBe("flow");
		expect(editor.documentState.documentProfile).toBe("flow");
		expect(editor.editorViewMode).toBe("flow");

		editor.destroy();
	});

	it("drops flow-disallowed block insertions at the mutation boundary", () => {
		const editor = createEditor({
			documentProfile: "flow",
		});
		const diagnostics: unknown[] = [];

		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "db1",
				blockType: "database",
				props: {},
				position: "last",
			},
		]);

		expect(editor.getBlock("db1")).toBeNull();
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_PROFILE_001",
				level: "warn",
				source: "profile-policy",
				blockType: "database",
				documentProfile: "flow",
			}),
		);

		editor.destroy();
	});

	it("re-applies the flow mutation boundary after extension hooks run", () => {
		const editor = createEditor({
			documentProfile: "flow",
		});
		const diagnostics: unknown[] = [];

		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		editor.onBeforeApply(
			(ops) => [
				...ops,
				{
					type: "insert-block",
					blockId: "db-after-hook",
					blockType: "database",
					props: {},
					position: "last",
				},
			],
			{ priority: 20000 },
		);

		editor.apply([
			{
				type: "insert-block",
				blockId: "p-after-hook",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);

		expect(editor.getBlock("p-after-hook")?.type).toBe("paragraph");
		expect(editor.getBlock("db-after-hook")).toBeNull();
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_PROFILE_001",
				blockType: "database",
				documentProfile: "flow",
			}),
		);

		editor.destroy();
	});

	it("drops flow-disallowed block conversions at the mutation boundary", () => {
		const editor = createEditor({
			documentProfile: "flow",
		});
		const firstBlockId = editor.firstBlock()!.id;

		editor.apply([
			{
				type: "insert-text",
				blockId: firstBlockId,
				offset: 0,
				text: "Hello",
			},
		]);

		editor.apply([
			{
				type: "convert-block",
				blockId: firstBlockId,
				newType: "database",
				newProps: {},
			},
		]);

		expect(editor.getBlock(firstBlockId)?.type).toBe("paragraph");
		expect(editor.getBlock(firstBlockId)?.textContent()).toBe("Hello");

		editor.destroy();
	});

	it("still allows optional structural blocks in flow documents", () => {
		const editor = createEditor({
			documentProfile: "flow",
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "table1",
				blockType: "table",
				props: {},
				position: "last",
			},
		]);

		expect(editor.getBlock("table1")?.type).toBe("table");

		editor.destroy();
	});

});
