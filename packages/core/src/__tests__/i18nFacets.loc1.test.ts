import { defaultSchema } from "./fixtures/testSchema";
import type { MessageKey } from "@input/pen-types";
import { defineExtension } from "@input/pen-core";
import { describe, expect, it } from "vitest";

import { createHeadlessEditor } from "../editor/editor";
import { getFacetSpec } from "../facets/defineFacet";
import { localeFacet, messagesFacet } from "../facets/i18nFacets";
import { resolveEditorMessage } from "../i18n/resolveEditorMessage";

const ARABIC_BLOCKS_SELECTED = {
	zero: "لا عناصر",
	one: "عنصر واحد",
	two: "عنصران",
	few: "{count} عناصر",
	many: "{count} عنصرًا",
	other: "{count} عنصر",
} as const;

describe("locale and messages facets (LOC1, LOC3, LOC6)", () => {
	it("LOC3: names the locale facet pen.locale and first provider wins", () => {
		expect(localeFacet.name).toBe("pen.locale");
		const spec = getFacetSpec(localeFacet);
		expect(spec.combine(["de", "ja"])).toBe("de");
		expect(spec.combine([])).toBe("en");
	});

	it("LOC1: names the messages facet pen.messages", () => {
		expect(messagesFacet.name).toBe("pen.messages");
	});

	it("LOC3: createEditor locale option becomes the facet value", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema,  locale: "ar" });
		expect(editor.facet(localeFacet)).toBe("ar");
		editor.destroy();
	});

	it("LOC3: host locale beats an extension at the same precedence", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,locale: "de",
			extensions: [
				defineExtension({
					name: "locale-ext",
					facets: [localeFacet.of("ja", "highest")],
				}),
			],
		});
		expect(editor.facet(localeFacet)).toBe("de");
		editor.destroy();
	});

	it("LOC3: an extension locale beats the environment default", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,extensions: [
				defineExtension({
					name: "locale-ext",
					facets: [localeFacet.of("ja", "highest")],
				}),
			],
		});
		expect(editor.facet(localeFacet)).toBe("ja");
		editor.destroy();
	});

	it("LOC1: extension catalogs merge and the host override wins overlapping keys", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,extensions: [
				defineExtension({
					name: "copy-a",
					facets: [
						messagesFacet.of({
							"pen.ai.review.accept": "ExtAccept",
							"pen.schema.paragraph.title": "ExtPara",
						}),
					],
				}),
				defineExtension({
					name: "copy-b",
					facets: [
						messagesFacet.of({
							"pen.schema.heading.title": "ExtHeading",
						}),
					],
				}),
			],
			messages: {
				"pen.ai.review.accept": "HostAccept",
			},
		});

		expect(resolveEditorMessage(editor, "pen.ai.review.accept")).toBe(
			"HostAccept",
		);
		expect(resolveEditorMessage(editor, "pen.schema.paragraph.title")).toBe(
			"ExtPara",
		);
		expect(resolveEditorMessage(editor, "pen.schema.heading.title")).toBe(
			"ExtHeading",
		);
		expect(resolveEditorMessage(editor, "pen.display.group.basic")).toBe(
			"Basic",
		);
		editor.destroy();
	});

	it("LOC1: a missing key emits message-missing once and never returns the raw key", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const codes: string[] = [];
		editor.on("diagnostic", (event) => {
			if (event.code === "message-missing") {
				codes.push(String((event as { key?: string }).key ?? event.message));
			}
		});

		const missing = "pen.unknown.missing" as MessageKey;
		expect(resolveEditorMessage(editor, missing)).toBe("");
		expect(resolveEditorMessage(editor, missing)).toBe("");
		expect(codes).toEqual(["pen.unknown.missing"]);
		editor.destroy();
	});

	it("LOC1: omitting a host key falls back to the default catalog without a diagnostic", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,messages: {
				"pen.ai.review.accept": "OK",
			},
		});
		const codes: string[] = [];
		editor.on("diagnostic", (event) => {
			if (event.code === "message-missing") {
				codes.push(event.code);
			}
		});

		expect(resolveEditorMessage(editor, "pen.ai.review.accept")).toBe("OK");
		expect(resolveEditorMessage(editor, "pen.schema.paragraph.title")).toBe(
			"Paragraph",
		);
		expect(codes).toEqual([]);
		editor.destroy();
	});

	it("LOC6: counted messages select Arabic plural categories", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,locale: "ar",
			messages: {
				"pen.selection.blocksSelected": ARABIC_BLOCKS_SELECTED,
			},
		});

		expect(
			resolveEditorMessage(editor, "pen.selection.blocksSelected", {
				count: 0,
			}),
		).toBe("لا عناصر");
		expect(
			resolveEditorMessage(editor, "pen.selection.blocksSelected", {
				count: 1,
			}),
		).toBe("عنصر واحد");
		expect(
			resolveEditorMessage(editor, "pen.selection.blocksSelected", {
				count: 2,
			}),
		).toBe("عنصران");
		expect(
			resolveEditorMessage(editor, "pen.selection.blocksSelected", {
				count: 3,
			}),
		).toBe("3 عناصر");
		expect(
			resolveEditorMessage(editor, "pen.selection.blocksSelected", {
				count: 11,
			}),
		).toBe("11 عنصرًا");
		expect(
			resolveEditorMessage(editor, "pen.selection.blocksSelected", {
				count: 100,
			}),
		).toBe("100 عنصر");
		editor.destroy();
	});

	it("LOC6: suggestion and search counters select plural categories", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,locale: "ar",
			messages: {
				"pen.ai.suggestion.count": {
					one: "واحد من {count}",
					other: "{current} من {count}",
				},
				"pen.search.results.count": {
					one: "نتيجة {current} من {count}",
					other: "{current} من {count} نتائج",
				},
			},
		});
		expect(
			resolveEditorMessage(editor, "pen.ai.suggestion.count", {
				current: 1,
				count: 1,
			}),
		).toBe("واحد من 1");
		expect(
			resolveEditorMessage(editor, "pen.ai.suggestion.count", {
				current: 2,
				count: 5,
			}),
		).toBe("2 من 5");
		expect(
			resolveEditorMessage(editor, "pen.search.results.count", {
				current: 1,
				count: 1,
			}),
		).toBe("نتيجة 1 من 1");
		expect(
			resolveEditorMessage(editor, "pen.search.results.count", {
				current: 2,
				count: 5,
			}),
		).toBe("2 من 5 نتائج");
		editor.destroy();
	});

	it("LOC6: English counted messages use one and other", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema,  locale: "en" });
		expect(
			resolveEditorMessage(editor, "pen.selection.blocksSelected", {
				count: 1,
			}),
		).toBe("1 block selected");
		expect(
			resolveEditorMessage(editor, "pen.selection.blocksSelected", {
				count: 2,
			}),
		).toBe("2 blocks selected");
		editor.destroy();
	});
});
