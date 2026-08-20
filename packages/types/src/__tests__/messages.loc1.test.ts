import { describe, expect, it } from "vitest";

import {
	DEFAULT_MESSAGE_CATALOG,
	resolveMessage,
	type MessageKey,
} from "../types/messages";

const SPEC_KEYS = [
	"pen.selection.blocksSelected",
	"pen.ai.review.accept",
] as const satisfies readonly MessageKey[];

describe("message catalog (LOC1)", () => {
	it("LOC1: DEFAULT_MESSAGE_CATALOG is data — every key is namespaced and not the raw key", () => {
		const keys = Object.keys(DEFAULT_MESSAGE_CATALOG);
		expect(keys.length).toBeGreaterThan(0);

		for (const key of keys) {
			expect(key.startsWith("pen.")).toBe(true);
			expect(key.slice("pen.".length)).toContain(".");

			const value = DEFAULT_MESSAGE_CATALOG[key as MessageKey];
			expect(typeof value).toBe("string");
			if (typeof value !== "string") {
				throw new Error(`expected string catalog entry for ${key}`);
			}
			expect(value.length).toBeGreaterThan(0);
			expect(value).not.toBe(key);
		}

		for (const key of SPEC_KEYS) {
			expect(keys).toContain(key);
		}
	});

	it("LOC1: resolveMessage falls back to the default catalog and never returns the raw key", () => {
		expect(resolveMessage({}, "pen.ai.review.accept")).toBe(
			DEFAULT_MESSAGE_CATALOG["pen.ai.review.accept"],
		);
		expect(
			resolveMessage({}, "pen.selection.blocksSelected", { count: 3 }),
		).toBe("3 blocks selected");
		expect(resolveMessage({}, "pen.ai.review.accept")).not.toBe(
			"pen.ai.review.accept",
		);
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
		expect(resolveMessage(catalog, "pen.display.group.basic")).toBe("Basic");
	});

	it("LOC1: resolveMessage interpolates named parameters into one catalog entry", () => {
		expect(
			resolveMessage({}, "pen.a11y.blockConverted", { blockType: "heading" }),
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
				{ "pen.a11y.blockConverted": "Converted to {blockType} ({extra})" },
				"pen.a11y.blockConverted",
				{ blockType: "quote" },
			),
		).toBe("Converted to quote ({extra})");
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
});
