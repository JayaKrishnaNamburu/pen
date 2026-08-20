import { describe, expect, it } from "vitest";

import { createEditor } from "../index";
import { defaultSchema } from "@input/pen-schema-default";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function propsWithOwnKey(
	key: string,
	value: unknown,
	base: Record<string, unknown> = { id: "user-1", label: "Ada" },
): Record<string, unknown> {
	const props: Record<string, unknown> = { ...base };
	Object.defineProperty(props, key, {
		value,
		enumerable: true,
		configurable: true,
		writable: true,
	});
	return props;
}

function hasInlineNode(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
	nodeType: string,
): boolean {
	return (editor.getBlock(blockId)?.inlineDeltas() ?? []).some((delta) => {
		const insert = delta.insert;
		return (
			typeof insert === "object" &&
			insert !== null &&
			"type" in insert &&
			insert.type === nodeType
		);
	});
}

describe("SEC6 op payload validation", () => {
	it("SEC6: valid insert-inline-node writes a fresh embed from validated fields", () => {
		const editor = createEditor({ schema: defaultSchema,  preset: noDefaultExtensionsPreset });

		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "insert-text", blockId: "b1", offset: 0, text: "Hi" },
			{
				type: "insert-inline-node",
				blockId: "b1",
				offset: 2,
				nodeType: "mention",
				props: { id: "user-1", label: "Ada" },
			},
		]);

		expect(editor.getBlock("b1")?.inlineDeltas()).toEqual([
			{ insert: "Hi" },
			{
				insert: {
					type: "mention",
					props: { id: "user-1", label: "Ada" },
				},
			},
		]);

		editor.destroy();
	});

	it("SEC6: proto keys in insert-inline-node props are dropped with a diagnostic", () => {
		const editor = createEditor({ schema: defaultSchema,  preset: noDefaultExtensionsPreset });
		const diagnostics: unknown[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "insert-text", blockId: "b1", offset: 0, text: "Hi" },
		]);

		for (const key of ["__proto__", "constructor", "prototype"] as const) {
			editor.apply([
				{
					type: "insert-inline-node",
					blockId: "b1",
					offset: 2,
					nodeType: "mention",
					props: propsWithOwnKey(key, { polluted: true }),
				},
			]);
		}

		expect(diagnostics).toEqual([
			expect.objectContaining({
				code: "PEN_APPLY_009",
				level: "warn",
				source: "apply",
			}),
			expect.objectContaining({
				code: "PEN_APPLY_009",
				level: "warn",
				source: "apply",
			}),
			expect.objectContaining({
				code: "PEN_APPLY_009",
				level: "warn",
				source: "apply",
			}),
		]);
		expect(hasInlineNode(editor, "b1", "mention")).toBe(false);
		expect(
			Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"),
		).toBe(false);

		editor.destroy();
	});

	it("SEC6: proto keys in insert-block props are dropped with a diagnostic", () => {
		const editor = createEditor({ schema: defaultSchema,  preset: noDefaultExtensionsPreset });
		const diagnostics: unknown[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "hostile",
				blockType: "paragraph",
				props: {
					title: "kept",
					extra: propsWithOwnKey("constructor", { polluted: true }, {}),
				},
				position: "last",
			},
		]);

		expect(editor.getBlock("hostile")).toBeNull();
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_APPLY_009",
				level: "warn",
				source: "apply",
			}),
		);
		expect(
			Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"),
		).toBe(false);

		editor.destroy();
	});

	it("SEC6: proto keys in update-block props are dropped with a diagnostic", () => {
		const editor = createEditor({ schema: defaultSchema,  preset: noDefaultExtensionsPreset });
		const diagnostics: unknown[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "h1",
				blockType: "heading",
				props: { level: 1 },
				position: "last",
			},
		]);

		editor.apply([
			{
				type: "update-block",
				blockId: "h1",
				props: propsWithOwnKey("__proto__", { polluted: true }, { level: 2 }),
			},
		]);

		expect(editor.getBlock("h1")?.props.level).toBe(1);
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_APPLY_009",
				level: "warn",
				source: "apply",
			}),
		);
		expect(
			Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"),
		).toBe(false);

		editor.destroy();
	});

	it("SEC6: proto keys in format-text marks are dropped with a diagnostic", () => {
		const editor = createEditor({ schema: defaultSchema,  preset: noDefaultExtensionsPreset });
		const diagnostics: unknown[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "insert-text", blockId: "b1", offset: 0, text: "Hi" },
		]);

		editor.apply([
			{
				type: "format-text",
				blockId: "b1",
				offset: 0,
				length: 2,
				marks: propsWithOwnKey("__proto__", { polluted: true }, { bold: true }),
			},
		]);

		expect(editor.getBlock("b1")?.textDeltas()).toEqual([{ insert: "Hi" }]);
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_APPLY_009",
				level: "warn",
				source: "apply",
			}),
		);
		expect(
			Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"),
		).toBe(false);

		editor.destroy();
	});

	it("SEC6: hand-crafted invalid op via editor.apply is dropped with a diagnostic", () => {
		const editor = createEditor({ schema: defaultSchema,  preset: noDefaultExtensionsPreset });
		const diagnostics: unknown[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "unknown",
				blockType: "not-a-registered-type",
				props: {},
				position: "last",
			},
		]);

		expect(editor.getBlock("unknown")).toBeNull();
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_APPLY_002",
				level: "warn",
				source: "apply",
			}),
		);

		editor.destroy();
	});
});
