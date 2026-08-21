import { createEditor, keymapFacet } from "@input/pen-core";
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
		[{ type: "insert-text", blockId: block.id, offset: 0, text: "hello" }],
		{ origin: "user" },
	);
	editor.selectText(block.id, 0, 5);
	return block.id;
}

async function withEditor(
	options: CreateEditorOptions,
	run: (editor: ReturnType<typeof createEditor>) => void,
): Promise<void> {
	const editor = createEditor(options);
	try {
		run(editor);
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
});
