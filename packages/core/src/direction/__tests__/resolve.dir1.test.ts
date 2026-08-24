import { describe, expect, it } from "vitest";

import { createHeadlessEditor, defineExtension } from "../../index";
import { defaultSchema } from "../../__tests__/fixtures/testSchema";
import { getFacetSpec } from "../../facets/defineFacet";
import {
	blockDirectionFacet,
	defaultDirectionFacet,
} from "../../facets/directionFacets";
import { resolveBlockDirection } from "../resolve";

function createEditor(
	options: Parameters<typeof createHeadlessEditor>[0] = {},
) {
	return createHeadlessEditor({
		schema: defaultSchema,
		...options,
	});
}

function setBlock(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
	text: string,
	direction?: "ltr" | "rtl" | "auto",
) {
	editor.apply([
		{
			type: "splice-text",
			blockId,
			from: 0,
			to: 0,
			insert: text,
		},
		...(direction
			? [
					{
						type: "set-props" as const,
						blockId,
						props: { direction },
					},
				]
			: []),
	]);
}

describe("block direction resolution DIR1 DIR2 DIR3", () => {
	it("DIR1: names the facets and combines in R1 order", () => {
		expect(blockDirectionFacet.name).toBe("pen.blockDirection");
		expect(defaultDirectionFacet.name).toBe("pen.defaultDirection");
		const rtl = () => "rtl" as const;
		const ltr = () => "ltr" as const;
		expect(getFacetSpec(blockDirectionFacet).combine([rtl, ltr])).toEqual([
			rtl,
			ltr,
		]);
		expect(getFacetSpec(defaultDirectionFacet).combine(["rtl", "ltr"])).toBe(
			"rtl",
		);
		expect(getFacetSpec(defaultDirectionFacet).combine([])).toBe("ltr");
	});

	it("DIR1: explicit prop wins; auto skips facet resolvers", () => {
		const editor = createEditor({
			extensions: [
				defineExtension({
					name: "dir-facet",
					facets: [blockDirectionFacet.of(() => "rtl")],
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		setBlock(editor, blockId, "Hello", "ltr");
		expect(resolveBlockDirection(editor, editor.getBlock(blockId)!)).toBe(
			"ltr",
		);

		editor.apply([
			{
				type: "set-props",
				blockId,
				props: { direction: "auto" },
			},
		]);
		expect(resolveBlockDirection(editor, editor.getBlock(blockId)!)).toBe(
			"ltr",
		);
		editor.destroy();
	});

	it("DIR1: first-strong table through the four-step resolve", () => {
		const editor = createEditor();
		const cases: Array<{
			text: string;
			direction?: "auto";
			expected: "ltr" | "rtl";
		}> = [
			{ text: "Hello", expected: "ltr" },
			{ text: "مرحبا", expected: "rtl" },
			{ text: "שלום", expected: "rtl" },
			{ text: "12345", expected: "ltr" },
			{ text: "...", expected: "ltr" },
			{ text: "...Hello", expected: "ltr" },
			{ text: "...مرحبا", expected: "rtl" },
		];

		const firstId = editor.firstBlock()!.id;
		for (const [index, row] of cases.entries()) {
			const blockId = index === 0 ? firstId : `row-${index}`;
			if (index > 0) {
				editor.apply([
					{
						type: "insert-block",
						blockId,
						blockType: "paragraph",
						props: {},
						position: "last",
					},
				]);
			}
			setBlock(editor, blockId, row.text, row.direction ?? "auto");
			expect(
				resolveBlockDirection(editor, editor.getBlock(blockId)!),
				row.text,
			).toBe(row.expected);
		}
		editor.destroy();
	});

	it("DIR1: digits-only and neutrals-only use pen.defaultDirection", () => {
		const editor = createEditor({
			extensions: [
				defineExtension({
					name: "dir-default",
					facets: [defaultDirectionFacet.of("rtl")],
				}),
			],
		});
		const digitsId = editor.firstBlock()!.id;
		const neutralsId = "neutrals";
		editor.apply([
			{
				type: "insert-block",
				blockId: neutralsId,
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		setBlock(editor, digitsId, "12345");
		setBlock(editor, neutralsId, "...");
		expect(resolveBlockDirection(editor, editor.getBlock(digitsId)!)).toBe(
			"rtl",
		);
		expect(resolveBlockDirection(editor, editor.getBlock(neutralsId)!)).toBe(
			"rtl",
		);
		editor.destroy();
	});

	it("DIR1: facet resolvers win in R1 order when the prop is unset", () => {
		const editor = createEditor({
			extensions: [
				defineExtension({
					name: "dir-low",
					facets: [blockDirectionFacet.of(() => null, "low")],
				}),
				defineExtension({
					name: "dir-high",
					facets: [
						blockDirectionFacet.of((block) =>
							block.id === "quoted" ? "rtl" : null,
						),
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
		]);
		setBlock(editor, latinId, "Hello");
		setBlock(editor, "quoted", "Hello");
		expect(resolveBlockDirection(editor, editor.getBlock(latinId)!)).toBe(
			"ltr",
		);
		expect(resolveBlockDirection(editor, editor.getBlock("quoted")!)).toBe(
			"rtl",
		);
		editor.destroy();
	});

	it("DIR1: cache invalidates when text or props appear in a summary", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		setBlock(editor, blockId, "مرحبا", "auto");
		expect(resolveBlockDirection(editor, editor.getBlock(blockId)!)).toBe(
			"rtl",
		);

		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0 + editor.getBlock(blockId)!.length(),
				insert: "Hello",
			},
		]);
		expect(editor.lastChangeSummary?.blockText.some((change) => change.blockId === blockId)).toBe(
			true,
		);
		expect(resolveBlockDirection(editor, editor.getBlock(blockId)!)).toBe(
			"ltr",
		);

		editor.apply([
			{
				type: "set-props",
				blockId,
				props: { direction: "rtl" },
			},
		]);
		expect(
			editor.lastChangeSummary?.structural.some(
				(change) =>
					change.type === "block-props-changed" && change.blockId === blockId,
			),
		).toBe(true);
		expect(resolveBlockDirection(editor, editor.getBlock(blockId)!)).toBe(
			"rtl",
		);
		editor.destroy();
	});

	it("DIR1: cache invalidates when facet outputs change", () => {
		const editor = createEditor({
			extensions: [
				defineExtension({
					name: "dir-default",
					facets: [
						defaultDirectionFacet.compute(["document"], (ed) =>
							ed.firstBlock()?.textContent().includes("!") ? "rtl" : "ltr",
						),
					],
				}),
			],
		});
		const firstId = editor.firstBlock()!.id;
		const digitsId = "digits";
		editor.apply([
			{
				type: "insert-block",
				blockId: digitsId,
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		setBlock(editor, digitsId, "12345");
		expect(resolveBlockDirection(editor, editor.getBlock(digitsId)!)).toBe(
			"ltr",
		);

		editor.apply([
			{
				type: "splice-text",
				blockId: firstId,
				from: 0,
				to: 0,
				insert: "!",
			},
		]);
		expect(editor.facet(defaultDirectionFacet)).toBe("rtl");
		expect(resolveBlockDirection(editor, editor.getBlock(digitsId)!)).toBe(
			"rtl",
		);
		editor.destroy();
	});

	it("DIR1: resolved direction is never auto", () => {
		const editor = createEditor({
			extensions: [
				defineExtension({
					name: "dir-facet",
					facets: [
						blockDirectionFacet.of((block) =>
							block.id === "quoted" ? "rtl" : null,
						),
					],
				}),
			],
		});
		const missingId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "auto",
				blockType: "paragraph",
				props: { direction: "auto" },
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "quoted",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "explicit",
				blockType: "paragraph",
				props: { direction: "rtl" },
				position: "last",
			},
		]);
		setBlock(editor, missingId, "Hello");
		setBlock(editor, "auto", "Hello");
		setBlock(editor, "quoted", "Hello");

		expect(resolveBlockDirection(editor, editor.getBlock(missingId)!)).toBe(
			"ltr",
		);
		expect(resolveBlockDirection(editor, editor.getBlock("auto")!)).toBe("ltr");
		expect(resolveBlockDirection(editor, editor.getBlock("quoted")!)).toBe(
			"rtl",
		);
		expect(resolveBlockDirection(editor, editor.getBlock("explicit")!)).toBe(
			"rtl",
		);
		editor.destroy();
	});

	it("DIR3: nested blocks resolve independently", () => {
		const editor = createEditor();
		const parentId = editor.firstBlock()!.id;
		const childId = "child";
		editor.apply([
			{
				type: "set-props",
				blockId: parentId,
				props: { direction: "rtl" },
			},
			{
				type: "insert-block",
				blockId: childId,
				blockType: "paragraph",
				props: { parentId, direction: "auto" },
				position: "last",
			},
		]);
		setBlock(editor, parentId, "مرحبا");
		setBlock(editor, childId, "Hello");

		expect(resolveBlockDirection(editor, editor.getBlock(parentId)!)).toBe(
			"rtl",
		);
		expect(resolveBlockDirection(editor, editor.getBlock(childId)!)).toBe(
			"ltr",
		);
		editor.destroy();
	});
});
