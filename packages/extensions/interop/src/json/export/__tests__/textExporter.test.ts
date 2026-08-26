import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { exportEditorToJson } from "../exporter";
import { jsonImporter } from "../importer";
import { exportEditorToText, exportPenDocumentToText } from "../textExporter";
import type { PenDocumentJSON } from "../types";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createBareEditor() {
	const editor = createEditor({
		schema: defaultSchema,
		preset: noDefaultExtensionsPreset,
	});
	const existingBlockIds = [...editor.documentState.allBlocks()]
		.filter((handle) => handle.parent === null)
		.map((handle) => handle.id);
	if (existingBlockIds.length > 0) {
		editor.apply(
			existingBlockIds.reverse().map((blockId) => ({
				type: "delete-block" as const,
				blockId,
			})),
		);
	}
	return editor;
}

describe("exportPenDocumentToText", () => {
	it("exports nested block text in document order", () => {
		const document: PenDocumentJSON = {
			version: 1,
			blocks: [
				{
					id: "one",
					type: "paragraph",
					props: {},
					content: { text: "One" },
					children: [
						{
							id: "child",
							type: "paragraph",
							props: {},
							content: { text: "Child" },
						},
					],
				},
				{
					id: "two",
					type: "paragraph",
					props: {},
					content: { text: "Two" },
				},
			],
		};

		expect(exportPenDocumentToText(document)).toBe("One\nChild\nTwo");
	});

	it("supports host-owned block exclusion and inline node rendering", () => {
		const document: PenDocumentJSON = {
			version: 1,
			blocks: [
				{
					id: "body",
					type: "paragraph",
					props: {},
					content: {
						text: "Hello ",
						segments: [
							{ type: "text", text: "Hello " },
							{
								type: "node",
								nodeType: "mention",
								props: { label: "Ada" },
							},
						],
					},
				},
				{
					id: "quote",
					type: "emailQuote",
					props: {},
					content: { text: "Quoted" },
				},
			],
		};

		expect(
			exportPenDocumentToText(document, {
				excludeBlockTypes: ["emailQuote"],
				renderInlineNode(segment) {
					const label = segment.props?.label;
					return segment.nodeType === "mention" &&
						typeof label === "string"
						? `@${label}`
						: "";
				},
			}),
		).toBe("Hello @Ada");
	});

	it("EM1: empty block exports as empty text, not a zero-width space", () => {
		expect(
			exportPenDocumentToText({
				version: 1,
				blocks: [
					{
						id: "empty",
						type: "paragraph",
						props: {},
						content: { text: "" },
					},
				],
			}),
		).toBe("");
	});

	it("I14: user-typed zero-width space is not stripped", () => {
		expect(
			exportPenDocumentToText({
				version: 1,
				blocks: [
					{
						id: "typed",
						type: "paragraph",
						props: {},
						content: {
							text: "keep\u200Bme",
							segments: [
								{ type: "text", text: "keep" },
								{ type: "text", text: "\u200B" },
								{ type: "text", text: "me" },
							],
						},
					},
				],
			}),
		).toBe("keep\u200Bme");
	});

	it("EM1 I14: empty block round-trips through json export and import as empty text", async () => {
		const source = createBareEditor();
		source.apply([
			{
				type: "insert-block",
				blockId: "p1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);

		expect(exportEditorToText(source)).toBe("");
		const json = exportEditorToJson(source);
		expect(JSON.stringify(json)).not.toContain("\u200B");

		const target = createBareEditor();
		await jsonImporter.import(json, target);
		expect(exportEditorToText(target)).toBe("");

		void source.destroy();
		void target.destroy();
	});

	it("I14: user-typed zero-width space survives json export and import", async () => {
		const source = createBareEditor();
		source.apply([
			{
				type: "insert-block",
				blockId: "p1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		source.apply([
			{
				type: "splice-text",
				blockId: "p1",
				from: 0,
				to: 0,
				insert: "keep\u200Bme",
			},
		]);

		expect(exportEditorToText(source)).toBe("keep\u200Bme");
		const json = exportEditorToJson(source);

		const target = createBareEditor();
		await jsonImporter.import(json, target);
		expect(exportEditorToText(target)).toBe("keep\u200Bme");

		void source.destroy();
		void target.destroy();
	});

});
