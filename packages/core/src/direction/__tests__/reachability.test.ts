import { describe, expect, it } from "vitest";

import {
	blockDirectionFacet,
	createEditor,
	defaultDirectionFacet,
	defineExtension,
	resolveBlockDirection,
} from "../../index";
import { defaultSchema } from "../../__tests__/fixtures/testSchema";

describe("direction public API reachability", () => {
	it("createEditor installs a host direction resolver through the barrel", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				defineExtension({
					name: "quoted-rtl",
					facets: [
						blockDirectionFacet.of((block) =>
							block.id === "quoted" ? "rtl" : null,
						),
						defaultDirectionFacet.of("ltr"),
					],
				}),
			],
		});
		const latinId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "quoted",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-text",
				blockId: "quoted",
				offset: 0,
				text: "Hello",
			},
		]);

		expect(resolveBlockDirection(editor, editor.getBlock(latinId)!)).toBe(
			"ltr",
		);
		expect(resolveBlockDirection(editor, editor.getBlock("quoted")!)).toBe(
			"rtl",
		);
		editor.destroy();
	});
});
