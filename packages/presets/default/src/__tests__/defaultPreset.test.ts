import { createEditor, createHeadlessEditor, keymapFacet } from "@input/pen-core";
import { getDocumentToolRuntime } from "@input/pen-document-ops";
import { createDefaultSchema } from "@input/pen-schema-default";
import type { CreateEditorOptions, Editor, Extension } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import { defaultPreset } from "../index";

// Single contract list: resolve() pins order, live inventory pins the sorted set.
const PRESET_RESOLVE_ORDER = [
	"document-ops",
	"delta-stream",
	"undo",
	"rich-text-shortcuts",
] as const;

// Live `createEditor({ schema })` installs nothing. Core's no-preset fallback
// is empty (API1/F12); batteries arrive only via defaultPreset().
const BARE_EXTENSIONS: readonly string[] = [];

function installedExtensionNames(editor: Editor): string[] {
	const registered = (
		editor as unknown as {
			_extensions?: { _extensions?: Map<string, Extension> };
		}
	)._extensions?._extensions;
	if (!(registered instanceof Map)) {
		throw new Error(
			"createEditor no longer exposes the live extension map at " +
				"editor._extensions._extensions; the host-facing inventory cannot be pinned",
		);
	}
	return [...registered.keys()].sort();
}

function dispatchShortcut(editor: Editor, key: string): boolean {
	const binding = editor.facet(keymapFacet).find((entry) => entry.key === key);
	if (!binding) {
		return false;
	}
	return binding.handler(editor, {} as KeyboardEvent);
}

function seedSelectedHello(editor: Editor): string {
	const block = editor.firstBlock();
	if (!block) {
		throw new Error("expected an initial paragraph");
	}
	editor.apply(
		[{ type: "splice-text", blockId: block.id, from: 0,
				to: 0,
				insert: "hello" }],
		{ origin: "user" },
	);
	editor.selectText(block.id, 0, 5);
	return block.id;
}

async function withEditor(
	options: CreateEditorOptions,
	run: (editor: ReturnType<typeof createEditor>) => void | Promise<void>,
): Promise<void> {
	const editor = createEditor(options);
	try {
		await run(editor);
	} finally {
		await editor.destroy();
	}
}

describe("@input/pen-preset-default", () => {
	it("returns the standard default extension stack", () => {
		const preset = defaultPreset();
		const result = preset.resolve({
			schema: {} as never,
			documentProfile: "structured",
		});

		expect(result.extensions?.map((extension) => extension.name)).toEqual([
			...PRESET_RESOLVE_ORDER,
		]);
		expect(result.schema?.allBlocks().some((schema) => schema.type === "paragraph")).toBe(
			true,
		);
	});

	it("supports disabling individual default features", () => {
		const preset = defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
			shortcuts: false,
		});
		const result = preset.resolve({
			schema: {} as never,
			documentProfile: "structured",
		});

		expect(result.extensions ?? []).toEqual([]);
	});
});

describe("bare createEditor vs defaultPreset — live inventory", () => {
	const schema = createDefaultSchema();

	it("a live createEditor({ preset: defaultPreset() }) registers exactly the batteries set", async () => {
		await withEditor({ preset: defaultPreset() }, (editor) => {
			expect(installedExtensionNames(editor)).toEqual(
				[...PRESET_RESOLVE_ORDER].sort(),
			);
		});
	});

	it("a live createEditor({ schema }) registers exactly no extensions", async () => {
		await withEditor({ schema }, (editor) => {
			expect(installedExtensionNames(editor)).toEqual([...BARE_EXTENSIONS]);
		});
	});
});

describe("bare createEditor vs defaultPreset — bold/italic shortcuts", () => {
	const schema = createDefaultSchema();

	it("defaultPreset() Mod-b / Mod-i apply bold and italic on the selected text", async () => {
		await withEditor({ preset: defaultPreset() }, (editor) => {
			const blockId = seedSelectedHello(editor);

			expect(dispatchShortcut(editor, "Mod-b")).toBe(true);
			expect(editor.getBlock(blockId)?.textDeltas()).toEqual([
				{ insert: "hello", attributes: { bold: true } },
			]);

			expect(dispatchShortcut(editor, "Mod-i")).toBe(true);
			expect(editor.getBlock(blockId)?.textDeltas()).toEqual([
				{ insert: "hello", attributes: { bold: true, italic: true } },
			]);
		});
	});

	it("intentional scope: bare createEditor({ schema }) has no Mod-b / Mod-i and does not apply marks", async () => {
		await withEditor({ schema }, (editor) => {
			const blockId = seedSelectedHello(editor);

			expect(editor.facet(keymapFacet).map((binding) => binding.key)).toEqual([]);
			expect(dispatchShortcut(editor, "Mod-b")).toBe(false);
			expect(dispatchShortcut(editor, "Mod-i")).toBe(false);
			expect(editor.getBlock(blockId)?.textDeltas()).toEqual([{ insert: "hello" }]);
		});
	});

	it("defaultPreset({ shortcuts: false }) does not apply bold", async () => {
		await withEditor({ preset: defaultPreset({ shortcuts: false }) }, (editor) => {
			const blockId = seedSelectedHello(editor);
			expect(dispatchShortcut(editor, "Mod-b")).toBe(false);
			expect(editor.getBlock(blockId)?.textDeltas()).toEqual([{ insert: "hello" }]);
		});
	});
});

describe("defaultPreset() batteries actually work", () => {
	it("undo reverts a user insert that a bare editor cannot undo", async () => {
		await withEditor({ preset: defaultPreset() }, (editor) => {
			const blockId = seedSelectedHello(editor);
			expect(editor.getBlock(blockId)?.textContent()).toBe("hello");
			editor.undoManager.undo();
			expect(editor.getBlock(blockId)?.textContent()).toBe("");
			expect(editor.internals.getSlot("undo:manager")).toBeTruthy();
		});

		await withEditor({ schema: createDefaultSchema() }, (editor) => {
			const blockId = seedSelectedHello(editor);
			expect(editor.internals.getSlot("undo:manager")).toBeFalsy();
			expect(editor.undoManager.canUndo()).toBe(false);
			expect(editor.undoManager.undo()).toBe(false);
			expect(editor.getBlock(blockId)?.textContent()).toBe("hello");
		});
	});

	it("defaultPreset({ undo: false }) leaves undo inert: the document stays changed", async () => {
		await withEditor({ preset: defaultPreset({ undo: false }) }, (editor) => {
			const blockId = seedSelectedHello(editor);
			expect(editor.internals.getSlot("undo:manager")).toBeFalsy();
			expect(editor.undoManager.canUndo()).toBe(false);
			expect(editor.undoManager.undo()).toBe(false);
			expect(editor.getBlock(blockId)?.textContent()).toBe("hello");
		});
	});

	it("createHeadlessEditor({ useDefaultExtensions: true }) is a no-op: undo stays inert", async () => {
		const editor = createHeadlessEditor({
			schema: createDefaultSchema(),
			useDefaultExtensions: true,
		});
		try {
			const blockId = seedSelectedHello(editor);
			expect(installedExtensionNames(editor)).toEqual([]);
			expect(editor.internals.getSlot("undo:manager")).toBeFalsy();
			expect(editor.undoManager.canUndo()).toBe(false);
			expect(editor.undoManager.undo()).toBe(false);
			expect(editor.getBlock(blockId)?.textContent()).toBe("hello");
		} finally {
			await editor.destroy();
		}
	});

	it("document-ops insert_block is registered and writes through the live runtime", async () => {
		await withEditor({ preset: defaultPreset() }, async (editor) => {
			const runtime = getDocumentToolRuntime(editor);
			expect(runtime).not.toBeNull();
			expect(runtime?.getTool("insert_block")?.mutating).toBe(true);

			const result = (await runtime!.executeTool(
				"insert_block",
				{
					position: "last",
					blockType: "paragraph",
					content: "from preset",
				},
				{} as never,
			)) as { blockId: string };

			expect(editor.getBlock(result.blockId)?.textContent()).toBe("from preset");
		});

		await withEditor(
			{ preset: defaultPreset({ documentOps: false }) },
			(editor) => {
				expect(getDocumentToolRuntime(editor)).toBeNull();
			},
		);
	});

	it("delta-stream installs a live streaming target slot", async () => {
		await withEditor({ preset: defaultPreset() }, (editor) => {
			expect(editor.internals.getSlot("delta-stream:target")).toBeTruthy();
		});

		await withEditor({ schema: createDefaultSchema() }, (editor) => {
			expect(editor.internals.getSlot("delta-stream:target")).toBeUndefined();
		});

		await withEditor(
			{ preset: defaultPreset({ deltaStream: false }) },
			(editor) => {
				expect(editor.internals.getSlot("delta-stream:target")).toBeUndefined();
			},
		);
	});
});
