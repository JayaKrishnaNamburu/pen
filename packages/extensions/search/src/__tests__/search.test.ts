import { describe, expect, it } from "vitest";
import {
	DEFAULT_SEARCH_OPTIONS,
	buildReplaceAllOps,
	buildSearchRegex,
	getNextActiveIndex,
	getPreviousActiveIndex,
} from "../index";

describe("@pen/search helpers", () => {
	it("falls back to literal matching for invalid regex input", () => {
		const regex = buildSearchRegex("(", {
			...DEFAULT_SEARCH_OPTIONS,
			regex: true,
		});

		expect(regex).toBeInstanceOf(RegExp);
		expect(regex?.source).toBe("\\(");
	});

	it("wraps navigation indices", () => {
		expect(getNextActiveIndex(-1, 3)).toBe(0);
		expect(getNextActiveIndex(2, 3)).toBe(0);
		expect(getPreviousActiveIndex(0, 3)).toBe(2);
		expect(getPreviousActiveIndex(-1, 3)).toBe(2);
	});

	it("builds replace-all ops in descending block offsets", () => {
		const ops = buildReplaceAllOps(
			[
				{ kind: "block", blockId: "b1", from: 1, to: 2, text: "a", index: 0 },
				{ kind: "block", blockId: "b1", from: 4, to: 5, text: "a", index: 1 },
				{ kind: "block", blockId: "b2", from: 0, to: 1, text: "a", index: 2 },
			],
			"z",
		);

		expect(ops).toMatchObject([
			{ type: "delete-text", blockId: "b1", offset: 4, length: 1 },
			{ type: "insert-text", blockId: "b1", offset: 4, text: "z" },
			{ type: "delete-text", blockId: "b1", offset: 1, length: 1 },
			{ type: "insert-text", blockId: "b1", offset: 1, text: "z" },
			{ type: "delete-text", blockId: "b2", offset: 0, length: 1 },
			{ type: "insert-text", blockId: "b2", offset: 0, text: "z" },
		]);
	});

	it("builds a single database update op per cell for replace-all", () => {
		const ops = buildReplaceAllOps(
			[
				{
					kind: "database-cell",
					blockId: "db-1",
					row: 0,
					col: 0,
					rowId: "row-1",
					columnId: "name",
					cellText: "alpha beta alpha",
					from: 0,
					to: 5,
					text: "alpha",
					index: 0,
				},
				{
					kind: "database-cell",
					blockId: "db-1",
					row: 0,
					col: 0,
					rowId: "row-1",
					columnId: "name",
					cellText: "alpha beta alpha",
					from: 11,
					to: 16,
					text: "alpha",
					index: 1,
				},
			],
			"omega",
		);

		expect(ops).toEqual([
			{
				type: "database-update-cell",
				blockId: "db-1",
				rowId: "row-1",
				columnId: "name",
				value: "omega beta omega",
			},
		]);
	});
});
