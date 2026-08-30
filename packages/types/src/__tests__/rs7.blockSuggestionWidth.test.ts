import { describe, expect, it } from "vitest";
import { REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES } from "../constants/reviewSurface";
import type { BlockSuggestion } from "../types/suggestions";

type Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type _ActionsMatchClassKeys = Assert<
	Equal<
		BlockSuggestion["action"],
		keyof typeof REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES
	>
>;

describe("RS7: BlockSuggestion action set is the class vocabulary", () => {
	it("RS7: split-block and format-text are contract actions and class keys", () => {
		const actions: BlockSuggestion["action"][] = [
			"insert-block",
			"delete-block",
			"move-block",
			"convert-block",
			"split-block",
			"format-text",
		];
		expect(actions.sort()).toEqual(
			Object.keys(REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES).sort(),
		);
	});
});
