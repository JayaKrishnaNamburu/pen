import { describe, expect, it } from "vitest";
import { parseSessionExecutionPrompt } from "./sessionExecutionPrompt";

describe("sessionExecutionPrompt", () => {
	it("parses wrapped inline session prompts into history and latest request", () => {
		const parsed = parseSessionExecutionPrompt(
			[
				"You are continuing an existing inline editor edit session.",
				"Earlier user requests in this same session:",
				"1. Rewrite the selection",
				"",
				"Apply the latest request to the current selected document state.",
				"Latest request:",
				"Make it more whimsical",
			].join("\n"),
		);

		expect(parsed).toEqual({
			latestPrompt: "Make it more whimsical",
			previousPrompts: ["Rewrite the selection"],
		});
	});

	it("returns null for plain prompts without session wrapping", () => {
		expect(parseSessionExecutionPrompt("Rewrite the selection")).toBeNull();
	});
});
