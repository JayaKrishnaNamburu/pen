import { describe, expect, it } from "vitest";
import { pendingBlocksFromHtmlFragment } from "../htmlBlocks";

describe("pendingBlocksFromHtmlFragment", () => {
	it("turns leftover details body HTML into paragraph children", () => {
		expect(
			pendingBlocksFromHtmlFragment("<p>NESTED-TOGGLE-CHILD</p>"),
		).toEqual([
			{
				type: "paragraph",
				props: {},
				content: "NESTED-TOGGLE-CHILD",
				marks: [],
			},
		]);
	});

	it("keeps inline marks and href inside leftover paragraphs", () => {
		expect(
			pendingBlocksFromHtmlFragment(
				'<p><em>Very</em> <a href="https://example.com">important</a></p>',
			),
		).toEqual([
			{
				type: "paragraph",
				props: {},
				content: "Very important",
				marks: [
					{ type: "italic", start: 0, end: 4 },
					{
						type: "link",
						props: { href: "https://example.com", title: undefined },
						start: 5,
						end: 14,
					},
				],
			},
		]);
	});
});
