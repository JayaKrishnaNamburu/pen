import { describe, expect, it } from "vitest";
import { resolveAISuggestionsConfig } from "../config";

describe("@pen/ai-suggestions config", () => {
	it("resolves the cheap preset", () => {
		const resolved = resolveAISuggestionsConfig({ mode: "cheap" });

		expect(resolved).toMatchObject({
			mode: "cheap",
			debounceMs: 1600,
			minChangedChars: 18,
			maxSuggestionsPerScope: 2,
			minConfidence: 0.9,
		});
	});

	it("allows explicit overrides on top of presets", () => {
		const resolved = resolveAISuggestionsConfig({
			mode: "balanced",
			maxSuggestionsPerScope: 1,
			cooldownMs: 1234,
		});

		expect(resolved).toMatchObject({
			mode: "balanced",
			maxSuggestionsPerScope: 1,
			cooldownMs: 1234,
		});
	});
});
