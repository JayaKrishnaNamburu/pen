import {
	createEditor as createCoreEditor,
	defineBlock,
	prop,
	SchemaRegistryImpl,
} from "@input/pen-core";
import type {
	BlockSchema,
	ComposableSchema,
	InlineSchema,
} from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { inputRulesExtension } from "../extension";
import type { InputRulesConfig } from "../types";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const paragraph = defineBlock("paragraph", {
	content: "inline",
	fieldEditor: "richtext",
});

const heading = defineBlock("heading", {
	props: {
		level: prop.enum([1, 2, 3, 4, 5, 6]).default(1),
	},
	content: "inline",
	fieldEditor: "richtext",
});

const bold: InlineSchema = {
	type: "bold",
	propSchema: {},
	kind: "mark",
	expand: "after",
	priority: 100,
	serialize: {},
};

function createTestSchema(): ComposableSchema {
	return new SchemaRegistryImpl({
		blocks: [paragraph, heading] as unknown as BlockSchema[],
		inlines: [bold],
	});
}

function createEditor(config?: InputRulesConfig) {
	return createCoreEditor({
		schema: createTestSchema(),
		extensions: [inputRulesExtension(config)],
		preset: noDefaultExtensionsPreset,
	});
}

async function flushMicrotasks(count = 2): Promise<void> {
	for (let index = 0; index < count; index++) {
		await Promise.resolve();
	}
}

function visibleText(text: string): string {
	return text.replace(/\u200B/g, "");
}

describe("inputRulesExtension editor activation", () => {
	it("activates input-rules extensions and applies block conversions", async () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;

		editor.selectTextRange({ blockId, offset: 0 }, { blockId, offset: 0 });

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "#",
				},
			],
			{ origin: "user" },
		);
		editor.selectTextRange({ blockId, offset: 1 }, { blockId, offset: 1 });
		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 1,
					text: " ",
				},
			],
			{ origin: "user" },
		);
		await flushMicrotasks();

		expect(editor.getBlock(blockId)?.type).toBe("heading");
		expect(editor.getBlock(blockId)?.props.level).toBe(1);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("");

		editor.destroy();
	});

	it("activates input-rules extensions and applies inline markdown conversions", async () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "**hello*",
				},
			],
			{ origin: "user" },
		);
		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 8,
					text: "*",
				},
			],
			{ origin: "user" },
		);
		await flushMicrotasks();

		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"hello",
		);
		expect(editor.getBlock(blockId)?.textDeltas()).toEqual([
			{
				insert: "hello",
				attributes: { bold: true },
			},
		]);

		editor.destroy();
	});

	it("a rule whose replacement rematches its trigger fires once per apply", async () => {
		let fires = 0;
		const editor = createEditor({
			disableDefaults: true,
			disableDefaultInlineRules: true,
			rules: [
				{
					id: "echo-space",
					match: /^!\s$/,
					blockTypes: ["paragraph"],
					handler: (_match, ctx) => {
						fires += 1;
						if (fires > 8) {
							throw new Error("input rule rematched its own output");
						}
						return [
							{
								type: "insert-text",
								blockId: ctx.blockId,
								offset: ctx.fullText.length + 1,
								text: " ",
							},
						];
					},
				},
			],
		});
		const blockId = editor.firstBlock()!.id;
		await editor.whenReady();

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "!",
				},
			],
			{ origin: "user" },
		);
		editor.selectTextRange({ blockId, offset: 1 }, { blockId, offset: 1 });
		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 1,
					text: " ",
				},
			],
			{ origin: "user" },
		);
		await flushMicrotasks();

		expect(fires).toBe(1);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("!  ");

		editor.destroy();
	});

	it("does not convert when the apply origin is input-rule", async () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		await editor.whenReady();

		editor.selectTextRange({ blockId, offset: 0 }, { blockId, offset: 0 });
		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "#",
				},
			],
			{ origin: "input-rule" },
		);
		editor.selectTextRange({ blockId, offset: 1 }, { blockId, offset: 1 });
		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 1,
					text: " ",
				},
			],
			{ origin: "input-rule" },
		);
		await flushMicrotasks();

		expect(editor.getBlock(blockId)?.type).toBe("paragraph");
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("# ");

		editor.destroy();
	});
});
