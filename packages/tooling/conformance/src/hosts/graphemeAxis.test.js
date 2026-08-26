/**
 * M6 grapheme-axis lock. Mid-Hello Latin cannot fail a broken clusterer.
 * These cases no-op the walk to one code point and require the expected
 * strings to reject that result.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	previousGraphemeBoundary,
	nextGraphemeBoundary,
} from "../../../../core/src/editor/textSegmentation.ts";
import {
	GRAPHEME_COMBINING_AFTER,
	GRAPHEME_COMBINING_AFTER_BACKSPACE,
	GRAPHEME_COMBINING_LINE,
	GRAPHEME_DEVANAGARI,
	GRAPHEME_DEVANAGARI_AFTER,
	GRAPHEME_DEVANAGARI_AFTER_BACKSPACE,
	GRAPHEME_DEVANAGARI_LINE,
	GRAPHEME_FLAG_AFTER,
	GRAPHEME_FLAG_AFTER_BACKSPACE,
	GRAPHEME_FLAG_LINE,
	GRAPHEME_RTL_AFTER_BACKSPACE,
	GRAPHEME_RTL_FAMILY_AFTER,
	GRAPHEME_RTL_LINE,
	GRAPHEME_THAI,
	GRAPHEME_THAI_AFTER,
	GRAPHEME_THAI_AFTER_BACKSPACE,
	GRAPHEME_THAI_LINE,
	GRAPHEME_ZWJ_AFTER,
	GRAPHEME_ZWJ_AFTER_BACKSPACE,
	GRAPHEME_ZWJ_FAMILY,
	GRAPHEME_ZWJ_LINE,
} from "../../fixtures/grapheme.ts";
import {
	CODE_POINT_WALK,
	deleteNextByWalk,
	deletePreviousByWalk,
} from "../graphemeDelete.ts";

const GRAPHEME_WALK = {
	previous: (text, offset) => previousGraphemeBoundary(text, offset, "en"),
	next: (text, offset) => nextGraphemeBoundary(text, offset, "en"),
};

const CASES = [
	{
		name: "ZWJ family",
		text: GRAPHEME_ZWJ_LINE,
		offset: GRAPHEME_ZWJ_AFTER,
		expected: GRAPHEME_ZWJ_AFTER_BACKSPACE,
		forbidden: ["\u200D", GRAPHEME_ZWJ_FAMILY],
	},
	{
		name: "combining mark",
		text: GRAPHEME_COMBINING_LINE,
		offset: GRAPHEME_COMBINING_AFTER,
		expected: GRAPHEME_COMBINING_AFTER_BACKSPACE,
		forbidden: ["\u0301"],
	},
	{
		name: "regional indicator flag",
		text: GRAPHEME_FLAG_LINE,
		offset: GRAPHEME_FLAG_AFTER,
		expected: GRAPHEME_FLAG_AFTER_BACKSPACE,
		forbidden: [],
	},
	{
		name: "Devanagari cluster",
		text: GRAPHEME_DEVANAGARI_LINE,
		offset: GRAPHEME_DEVANAGARI_AFTER,
		expected: GRAPHEME_DEVANAGARI_AFTER_BACKSPACE,
		forbidden: [GRAPHEME_DEVANAGARI],
	},
	{
		name: "Thai cluster",
		text: GRAPHEME_THAI_LINE,
		offset: GRAPHEME_THAI_AFTER,
		expected: GRAPHEME_THAI_AFTER_BACKSPACE,
		forbidden: [GRAPHEME_THAI],
	},
	{
		name: "RTL ZWJ family",
		text: GRAPHEME_RTL_LINE,
		offset: GRAPHEME_RTL_FAMILY_AFTER,
		expected: GRAPHEME_RTL_AFTER_BACKSPACE,
		forbidden: ["\u200D", GRAPHEME_ZWJ_FAMILY],
	},
];

test("M6 expected strings match the production grapheme walk", () => {
	for (const entry of CASES) {
		const after = deletePreviousByWalk(
			entry.text,
			entry.offset,
			GRAPHEME_WALK,
		);
		assert.equal(after, entry.expected, entry.name);
		for (const fragment of entry.forbidden) {
			assert.equal(
				after.includes(fragment),
				false,
				`${entry.name} leftover ${JSON.stringify(fragment)}`,
			);
		}
	}
});

test("M6 expected strings reject a one-code-point walk", () => {
	let diverged = 0;
	for (const entry of CASES) {
		const broken = deletePreviousByWalk(
			entry.text,
			entry.offset,
			CODE_POINT_WALK,
		);
		assert.notEqual(
			broken,
			entry.expected,
			`${entry.name}: code-point delete matched the grapheme result — fixture cannot fail`,
		);
		diverged += 1;
	}
	assert.ok(diverged === CASES.length);
});

test("M6 forward delete of a ZWJ family also diverges from a code-point walk", () => {
	const after = deleteNextByWalk(GRAPHEME_ZWJ_LINE, 1, GRAPHEME_WALK);
	const broken = deleteNextByWalk(GRAPHEME_ZWJ_LINE, 1, CODE_POINT_WALK);
	assert.equal(after, GRAPHEME_ZWJ_AFTER_BACKSPACE);
	assert.notEqual(broken, GRAPHEME_ZWJ_AFTER_BACKSPACE);
	assert.equal(after.includes("\u200D"), false);
	assert.equal(broken.includes("\u200D"), true);
});

test("deletePreviousByWalk is not identity on a cluster", () => {
	const after = deletePreviousByWalk(
		GRAPHEME_ZWJ_LINE,
		GRAPHEME_ZWJ_AFTER,
		GRAPHEME_WALK,
	);
	assert.notEqual(after, GRAPHEME_ZWJ_LINE);
	assert.equal(after.length < GRAPHEME_ZWJ_LINE.length, true);
});
