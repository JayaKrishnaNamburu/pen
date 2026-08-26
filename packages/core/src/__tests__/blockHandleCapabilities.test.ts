import { describe, expect, it } from "vitest";
import type { TableBlockHandle } from "@input/pen-types";
import { createEditor } from "../index";
import { defaultSchema } from "./fixtures/testSchema";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

describe("BlockHandle.as (API5)", () => {
	it('API5: as("table") on a paragraph is null at runtime and unchecked use is a type error', () => {
		const editor = createEditor({
			schema: defaultSchema,
			preset: noDefaultExtensionsPreset,
		});
		const paragraph = editor.firstBlock();
		expect(paragraph?.type).toBe("paragraph");

		const table = paragraph!.as("table");
		expect(table).toBeNull();

		// @ts-expect-error API5 table methods are not on the universal handle
		void paragraph!.tableRowCount;

		// @ts-expect-error API5 unchecked as("table") use
		const unchecked: TableBlockHandle = table;
		expect(unchecked).toBeNull();

		editor.destroy();
	});

	it('API5: as("table") follows schema-declared capabilities', () => {
		const editor = createEditor({
			schema: defaultSchema,
			preset: noDefaultExtensionsPreset,
		});
		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
		]);

		const table = editor.getBlock("t1")!.as("table");
		expect(table).not.toBeNull();
		expect(table?.id).toBe("t1");

		editor.destroy();
	});
});
