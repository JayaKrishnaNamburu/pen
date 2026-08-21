import { createEditor } from "@input/pen-core";
import { createDefaultSchema } from "@input/pen-schema-default";
import type { CreateEditorOptions, Extension } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import { defaultPreset } from "../index";

const PRESET_EXTENSIONS = [
	"document-ops",
	"delta-stream",
	"undo",
	"rich-text-shortcuts",
] as const;

// createEditor's fallback list is empty: core depends on no extension package
// at all (API1/F12), so every battery below arrives only via defaultPreset().
const REMOVED_FROM_CORE_FALLBACK = [
	"delta-stream",
	"rich-text-shortcuts",
	"document-ops",
	"undo",
] as const;

function probeDependingOn(name: string): Extension {
	return {
		name: `probe-depends-on-${name}`,
		version: "0.0.0",
		dependencies: [name],
	};
}

async function withEditor(
	options: CreateEditorOptions,
	run?: (editor: ReturnType<typeof createEditor>) => void,
): Promise<void> {
	const editor = createEditor(options);
	try {
		run?.(editor);
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
			...PRESET_EXTENSIONS,
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

describe("bare createEditor vs defaultPreset", () => {
	const schema = createDefaultSchema();

	it("registers each named preset extension on a live editor", async () => {
		for (const name of PRESET_EXTENSIONS) {
			try {
				await withEditor({
					preset: defaultPreset(),
					extensions: [probeDependingOn(name)],
				});
			} catch (error) {
				throw new Error(
					`defaultPreset() no longer registers "${name}". ` +
						`The batteries-included stack is document-ops, delta-stream, undo, ` +
						`and rich-text-shortcuts, and core's fallback list is empty, ` +
						`so the preset is the only path that supplies them.`,
					{ cause: error },
				);
			}
		}
	});

	it("a bare createEditor({ schema }) registers no extensions at all", () => {
		for (const name of REMOVED_FROM_CORE_FALLBACK) {
			expect(() =>
				createEditor({
					schema,
					extensions: [probeDependingOn(name)],
				}),
			).toThrow(
				`Extension "probe-depends-on-${name}" depends on "${name}", which is not registered`,
			);
		}
	});
});
