import { describe, expect, it } from "vitest";

import {
	createEditor,
	createEmptySchema,
	createHeadlessEditor,
} from "../index";

describe("API1 empty default schema", () => {
	it("API1: createEditor() without schema or a schema-bearing preset uses an empty registry", () => {
		const editor = createEditor();

		expect(editor.schema.allBlocks()).toEqual([]);
		expect(
			editor.schema
				.allBlocks()
				.some((schema) => schema.type === "paragraph"),
		).toBe(false);
		expect(editor.firstBlock()).toBeNull();

		editor.destroy();
	});

	it("API1: createHeadlessEditor() without schema uses an empty registry", () => {
		const editor = createHeadlessEditor();

		expect(editor.schema.allBlocks()).toEqual([]);
		expect(editor.firstBlock()).toBeNull();

		editor.destroy();
	});

	it("API1: createEmptySchema() is an empty passthrough registry", () => {
		const schema = createEmptySchema();

		expect(schema.allBlocks()).toEqual([]);
		expect(schema.resolve("paragraph")?.type).toBe("paragraph");
	});
});
