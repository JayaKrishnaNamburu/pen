import http from "node:http";
import { describe, expect, it } from "vitest";

const PROBE = "https://example.invalid/ai-suite-probe";

describe("AI suite network guard", () => {
	it("rejects fetch and names the URL", async () => {
		await expect(fetch(PROBE)).rejects.toThrow(
			`AI suite forbids network access: ${PROBE}`,
		);
	});

	it("rejects node http.request and names the URL", () => {
		expect(() => http.request("http://example.invalid/ai-suite-probe")).toThrow(
			"AI suite forbids network access: http://example.invalid/ai-suite-probe",
		);
	});
});
