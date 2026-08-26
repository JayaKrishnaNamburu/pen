import { describe, expect, it } from "vitest";
import type { A11yMessageKey } from "../types/a11yMessages";
import {
	DEFAULT_MESSAGE_CATALOG,
	type MessageCatalog,
	type MessageKey,
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
			const value = catalog[key];
			const text = typeof value === "string" ? value : value.other;
			expect(text.length).toBeGreaterThan(0);
			expect(text).not.toBe(key);
		}
	});
});
