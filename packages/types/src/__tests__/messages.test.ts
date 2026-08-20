import { describe, expect, it } from "vitest";
import type { A11yMessageKey } from "../types/a11yMessages";
import {
	DEFAULT_MESSAGE_CATALOG,
	type MessageCatalog,
	type MessageKey,
	type MessageParamsByKey,
	resolveMessage,
} from "../types/messages";

const A11Y_MESSAGE_KEYS = [
	"blockConverted",
	"undoApplied",
	"redoApplied",
	"blockSelectionEntered",
	"blockSelectionChanged",
	"cellSelectionChanged",
	"suggestionAppeared",
	"suggestionAccepted",
	"suggestionRejected",
	"streamingStarted",
	"streamingFinished",
	"findMatches",
	"atomSelected",
	"collaboratorJoined",
	"collaboratorEditing",
] as const satisfies readonly A11yMessageKey[];

describe("message catalog (LOC1)", () => {
	it("LOC1: MessageKey is namespaced pen.* and covers every A11yMessageKey", () => {
		const keys = Object.keys(DEFAULT_MESSAGE_CATALOG) as MessageKey[];

		expect(keys.length).toBeGreaterThan(0);
		for (const key of keys) {
			expect(key.startsWith("pen.")).toBe(true);
		}
		for (const a11yKey of A11Y_MESSAGE_KEYS) {
			expect(keys).toContain(`pen.a11y.${a11yKey}`);
		}
	});

	it("LOC1: DEFAULT_MESSAGE_CATALOG is a complete MessageCatalog", () => {
		const catalog: MessageCatalog = DEFAULT_MESSAGE_CATALOG;
		const keys = Object.keys(catalog) as MessageKey[];

		expect(keys).toEqual(Object.keys(DEFAULT_MESSAGE_CATALOG));
		for (const key of keys) {
			expect(catalog[key].length).toBeGreaterThan(0);
			expect(catalog[key]).not.toBe(key);
		}
	});

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
		expect(resolveMessage({}, "pen.schema.paragraph.title")).toBe("Paragraph");
		expect(
			resolveMessage({}, "pen.a11y.blockConverted", { blockType: "heading" }),
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
});
