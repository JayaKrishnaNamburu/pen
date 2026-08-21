import { describe, expect, it } from "vitest";

const PROBE = "https://example.invalid/ai-suite-probe";

describe("AI suite network guard", () => {
	it("rejects fetch and names the URL", async () => {
		await expect(fetch(PROBE)).rejects.toThrow(
			`AI suite forbids network access: ${PROBE}`,
		);
	});
});
