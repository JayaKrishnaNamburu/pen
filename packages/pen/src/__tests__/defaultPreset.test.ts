import {
	clipboardFacet,
	createEditor,
	createHeadlessEditor,
	keymapFacet,
	streamingTargetFacet,
	undoManagerFacet,
} from "@input/pen-core";
import { getDocumentToolRuntime } from "@input/pen-tools";
import { htmlImporter } from "@input/pen-interop/html";
import { createDefaultSchema } from "@input/pen-schema";
import type { CreateEditorOptions, Editor, Extension } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import {
	createEditor as starterCreateEditor,
	createHeadlessEditor as starterCreateHeadlessEditor,
	defaultPreset,
} from "../index";

// Single contract list: resolve() pins order, live inventory pins the sorted set.
const PRESET_RESOLVE_ORDER = [
	"tools",
	"delta-stream",
	"undo",
	"rich-text-shortcuts",
	"html-clipboard",
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
	const binding = editor
		.facet(keymapFacet)
		.find((entry) => entry.key === key);
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
		[
			{
				type: "splice-text",
				blockId: block.id,
				from: 0,
				to: 0,
				insert: "hello",
			},
		],
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

describe("@input/pen", () => {
	it("returns the standard default extension stack", () => {
		const preset = defaultPreset();
		const result = preset.resolve({
			schema: {} as never,
			documentProfile: "structured",
		});

		expect(result.extensions?.map((extension) => extension.name)).toEqual([
			...PRESET_RESOLVE_ORDER,
		]);
		expect(
			result.schema
				?.allBlocks()
				.some((schema) => schema.type === "paragraph"),
		).toBe(true);
	});

	it("supports disabling individual default features", () => {
		const preset = defaultPreset({
			tools: false,
			deltaStream: false,
			undo: false,
			shortcuts: false,
		});
		const result = preset.resolve({
			schema: {} as never,
			documentProfile: "structured",
		});

		expect(result.extensions?.map((extension) => extension.name)).toEqual([
			"html-clipboard",
		]);
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
			expect(installedExtensionNames(editor)).toEqual([
				...BARE_EXTENSIONS,
			]);
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

			expect(
				editor.facet(keymapFacet).map((binding) => binding.key),
			).toEqual([]);
			expect(dispatchShortcut(editor, "Mod-b")).toBe(false);
			expect(dispatchShortcut(editor, "Mod-i")).toBe(false);
			expect(editor.getBlock(blockId)?.textDeltas()).toEqual([
				{ insert: "hello" },
			]);
		});
	});

	it("defaultPreset({ shortcuts: false }) does not apply bold", async () => {
		await withEditor(
			{ preset: defaultPreset({ shortcuts: false }) },
			(editor) => {
				const blockId = seedSelectedHello(editor);
				expect(dispatchShortcut(editor, "Mod-b")).toBe(false);
				expect(editor.getBlock(blockId)?.textDeltas()).toEqual([
					{ insert: "hello" },
				]);
			},
		);
	});
});

describe("defaultPreset() batteries actually work", () => {
	it("undo reverts a user insert that a bare editor cannot undo", async () => {
		await withEditor({ preset: defaultPreset() }, (editor) => {
			const blockId = seedSelectedHello(editor);
			expect(editor.getBlock(blockId)?.textContent()).toBe("hello");
			editor.undoManager.undo();
			expect(editor.getBlock(blockId)?.textContent()).toBe("");
			expect(editor.facet(undoManagerFacet)).toBeTruthy();
		});

		await withEditor({ schema: createDefaultSchema() }, (editor) => {
			const blockId = seedSelectedHello(editor);
			expect(editor.facet(undoManagerFacet)).toBeFalsy();
			expect(editor.undoManager.canUndo()).toBe(false);
			expect(editor.undoManager.undo()).toBe(false);
			expect(editor.getBlock(blockId)?.textContent()).toBe("hello");
		});
	});

	it("defaultPreset({ undo: false }) leaves undo inert: the document stays changed", async () => {
		await withEditor(
			{ preset: defaultPreset({ undo: false }) },
			(editor) => {
				const blockId = seedSelectedHello(editor);
				expect(editor.facet(undoManagerFacet)).toBeFalsy();
				expect(editor.undoManager.canUndo()).toBe(false);
				expect(editor.undoManager.undo()).toBe(false);
				expect(editor.getBlock(blockId)?.textContent()).toBe("hello");
			},
		);
	});

	it("createHeadlessEditor({ useDefaultExtensions: true }) is a no-op: undo stays inert", async () => {
		const editor = createHeadlessEditor({
			schema: createDefaultSchema(),
			useDefaultExtensions: true,
		});
		try {
			const blockId = seedSelectedHello(editor);
			expect(installedExtensionNames(editor)).toEqual([]);
			expect(editor.facet(undoManagerFacet)).toBeFalsy();
			expect(editor.undoManager.canUndo()).toBe(false);
			expect(editor.undoManager.undo()).toBe(false);
			expect(editor.getBlock(blockId)?.textContent()).toBe("hello");
		} finally {
			await editor.destroy();
		}
	});

	it("tools insert_block is registered and writes through the live runtime", async () => {
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

			expect(editor.getBlock(result.blockId)?.textContent()).toBe(
				"from preset",
			);
		});

		await withEditor(
			{ preset: defaultPreset({ tools: false }) },
			(editor) => {
				expect(getDocumentToolRuntime(editor)).toBeNull();
			},
		);
	});

	it("defaultPreset() resolves an HTML paste importer the paste path can read", async () => {
		await withEditor({ preset: defaultPreset() }, (editor) => {
			const value = editor.facet(clipboardFacet);
			expect(Array.isArray(value)).toBe(false);
			expect(value).toMatchObject({ html: htmlImporter });
		});

		await withEditor({ schema: createDefaultSchema() }, (editor) => {
			const value = editor.facet(clipboardFacet);
			expect(value).toEqual({});
		});
	});

	it("R8: a second clipboardFacet provider merges without disabling the preset HTML importer", async () => {
		const markdown = {
			name: "markdown",
			mimeType: "text/markdown",
			parse: () => [],
			import: () => undefined,
		};
		await withEditor(
			{
				preset: defaultPreset({
					tools: false,
					deltaStream: false,
					undo: false,
					shortcuts: false,
				}),
				extensions: [
					{
						name: "host-markdown-clipboard",
						version: "0.0.0",
						facets: [clipboardFacet.of({ markdown })],
					},
				],
			},
			(editor) => {
				expect(editor.facet(clipboardFacet)).toMatchObject({
					html: htmlImporter,
					markdown,
				});
			},
		);
	});

	it("a partial host importer table keeps the preset HTML importer", async () => {
		await withEditor({ preset: defaultPreset() }, (editor) => {
			const markdown = {
				name: "markdown",
				mimeType: "text/markdown",
				parse: () => [],
				import: () => undefined,
			};
			const current = editor.facet(clipboardFacet);
			const base = current && !Array.isArray(current) ? current : {};
			editor.internals.assignSlot("paste:importers", {
				...base,
				markdown,
			});
			expect(editor.facet(clipboardFacet)).toMatchObject({
				html: htmlImporter,
				markdown,
			});
		});
	});

	it("starter createEditor() defaults to the batteries preset and default schema", async () => {
		const editor = starterCreateEditor();
		try {
			expect(installedExtensionNames(editor)).toEqual(
				[...PRESET_RESOLVE_ORDER].sort(),
			);
			const blockId = seedSelectedHello(editor);
			expect(editor.getBlock(blockId)?.textContent()).toBe("hello");
		} finally {
			await editor.destroy();
		}
	});

	it("starter createEditor({ preset }) uses the explicit preset, not the default", async () => {
		const editor = starterCreateEditor({
			preset: { resolve: () => ({ extensions: [] }) },
		});
		try {
			expect(installedExtensionNames(editor)).toEqual([]);
		} finally {
			await editor.destroy();
		}
	});

	it("starter createEditor({ extensions }) appends after the default batteries", async () => {
		const probe: Extension = { name: "probe", version: "0.0.0" };
		const editor = starterCreateEditor({ extensions: [probe] });
		try {
			expect(installedExtensionNames(editor)).toEqual(
				[...PRESET_RESOLVE_ORDER, "probe"].sort(),
			);
		} finally {
			await editor.destroy();
		}
	});

	it("starter createHeadlessEditor() carries the same batteries as the rendered constructor", async () => {
		const editor = starterCreateHeadlessEditor();
		try {
			expect(installedExtensionNames(editor)).toEqual(
				[...PRESET_RESOLVE_ORDER].sort(),
			);
		} finally {
			await editor.destroy();
		}
	});

	it("delta-stream installs a live streaming target slot", async () => {
		await withEditor({ preset: defaultPreset() }, (editor) => {
			expect(editor.facet(streamingTargetFacet)).toBeTruthy();
		});

		await withEditor({ schema: createDefaultSchema() }, (editor) => {
			expect(editor.facet(streamingTargetFacet) == null).toBe(true);
		});

		await withEditor(
			{ preset: defaultPreset({ deltaStream: false }) },
			(editor) => {
				expect(editor.facet(streamingTargetFacet) == null).toBe(true);
			},
		);
	});
});
