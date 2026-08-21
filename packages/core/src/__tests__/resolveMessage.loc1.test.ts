import { describe, expect, it } from "vitest";
import {
	DEFAULT_MESSAGE_CATALOG,
	type MessageKey,
	type MessageParamsByKey,
} from "@input/pen-types";
import { interpolateMessage, resolveMessage } from "../i18n/messages";

describe("resolveMessage (LOC1)", () => {
	it("LOC1: counted message keys require their params", () => {
		// @ts-expect-error LOC1: { count } is required
		resolveMessage({}, "pen.selection.blocksSelected");
		expect(
			resolveMessage({}, "pen.selection.blocksSelected", { count: 2 }),
		).toBe("2 blocks selected");
	});

	it("LOC1: resolveMessage interpolates typed params from the host catalog", () => {
		const params: MessageParamsByKey["pen.selection.blocksSelected"] = {
			count: 3,
		};

		expect(
			resolveMessage(
				{ "pen.selection.blocksSelected": "{count} Blöcke ausgewählt" },
				"pen.selection.blocksSelected",
				params,
			),
		).toBe("3 Blöcke ausgewählt");
		expect(
			resolveMessage(
				{ "pen.a11y.cellSelectionChanged": "{rows}×{columns} cells" },
				"pen.a11y.cellSelectionChanged",
				{ rows: 2, columns: 4 },
			),
		).toBe("2×4 cells");
	});

	it("LOC1: resolveMessage falls back to the default catalog when the host omits a key", () => {
		expect(resolveMessage({}, "pen.schema.paragraph.title")).toBe(
			"Paragraph",
		);
		expect(
			resolveMessage({}, "pen.a11y.blockConverted", {
				blockType: "heading",
			}),
		).toBe("Converted to heading");
		expect(
			resolveMessage(
				{ "pen.ai.review.accept": "Annehmen" },
				"pen.ai.review.accept",
			),
		).toBe("Annehmen");
		expect(resolveMessage({}, "pen.ai.review.accept")).toBe("Accept");
	});

	it("LOC1: resolveMessage never returns the raw key", () => {
		const keys = Object.keys(DEFAULT_MESSAGE_CATALOG) as MessageKey[];

		for (const key of keys) {
			const resolved = resolveMessage({}, key, {
				blockType: "paragraph",
				hint: "typing",
				count: 1,
				rows: 1,
				columns: 1,
				atomType: "mention",
				name: "Ada",
			} as never);
			expect(resolved).not.toBe(key);
			expect(resolved.length).toBeGreaterThan(0);
		}

		expect(
			resolveMessage({}, "pen.missing.example" as MessageKey),
		).not.toBe("pen.missing.example");
	});

	it("LOC1: resolveMessage prefers a host catalog entry over the default", () => {
		expect(
			resolveMessage(
				{ "pen.ai.review.accept": "Akzeptieren" },
				"pen.ai.review.accept",
			),
		).toBe("Akzeptieren");
		expect(
			resolveMessage(
				{ "pen.selection.blocksSelected": "{count} Blöcke ausgewählt" },
				"pen.selection.blocksSelected",
				{ count: 2 },
			),
		).toBe("2 Blöcke ausgewählt");
	});

	it("LOC1: a partial host catalog still resolves omitted keys from the default", () => {
		const catalog = { "pen.ai.review.accept": "OK" };

		expect(resolveMessage(catalog, "pen.ai.review.accept")).toBe("OK");
		expect(resolveMessage(catalog, "pen.schema.paragraph.title")).toBe(
			"Paragraph",
		);
		expect(resolveMessage(catalog, "pen.display.group.basic")).toBe(
			"Basic",
		);
	});

	it("LOC1: resolveMessage interpolates named parameters into one catalog entry", () => {
		expect(
			resolveMessage({}, "pen.a11y.blockConverted", {
				blockType: "heading",
			}),
		).toBe("Converted to heading");
		expect(
			resolveMessage({}, "pen.a11y.cellSelectionChanged", {
				rows: 2,
				columns: 4,
			}),
		).toBe("2 by 4 cells selected");
		expect(
			resolveMessage({}, "pen.a11y.collaboratorJoined", { name: "Ada" }),
		).toBe("Ada joined");
		expect(resolveMessage({}, "pen.a11y.findMatches", { count: 0 })).toBe(
			"0 matches",
		);
	});

	it("LOC1: resolveMessage is synchronous and pure", () => {
		const catalog = { "pen.ai.review.accept": "OK" };
		const first = resolveMessage(catalog, "pen.ai.review.accept");
		const second = resolveMessage(catalog, "pen.ai.review.accept");

		expect(first).toBe("OK");
		expect(second).toBe(first);
		expect(catalog).toEqual({ "pen.ai.review.accept": "OK" });
	});

	it("LOC1: resolveMessage leaves an unknown placeholder intact", () => {
		expect(
			resolveMessage(
				{
					"pen.a11y.blockConverted":
						"Converted to {blockType} ({extra})",
				},
				"pen.a11y.blockConverted",
				{ blockType: "quote" },
			),
		).toBe("Converted to quote ({extra})");
	});

	it("LOC6: composed review labels interpolate named parameters in one entry", () => {
		expect(resolveMessage({}, "pen.ai.review.subgroup.content.added")).toBe(
			"Content additions",
		);
		expect(
			resolveMessage({}, "pen.ai.review.blockSuggestion.insert", {
				blockType: "heading",
			}),
		).toBe("Insert heading");
	});

	it("LOC6: resolveMessage uses the other plural form when it has no locale", () => {
		expect(
			resolveMessage(
				{
					"pen.selection.blocksSelected": {
						one: "one block",
						other: "{count} blocks selected",
					},
				},
				"pen.selection.blocksSelected",
				{ count: 1 },
			),
		).toBe("1 blocks selected");
	});

	it("interpolates named placeholders and leaves unknown ones", () => {
		expect(interpolateMessage("Hello {name}", { name: "Ada" })).toBe(
			"Hello Ada",
		);
		expect(interpolateMessage("Hello {name}")).toBe("Hello {name}");
		expect(interpolateMessage("Hello {name}", {})).toBe("Hello {name}");
	});
});
