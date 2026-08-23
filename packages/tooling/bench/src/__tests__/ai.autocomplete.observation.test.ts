import { describe, expect, it } from "vitest";
import { bench, runSuite } from "../bench";
import {
	AI_AUTOCOMPLETE_PROVIDER_BUDGET_BENCH,
	AI_AUTOCOMPLETE_REQUESTING_CANCEL_CHURN_BENCH,
} from "../constants/benchmarks";
import {
	AUTOCOMPLETE_LOCAL_PROVIDER_ID,
	AUTOCOMPLETE_PROVIDER_BUDGET_MAX_CHARS,
	AUTOCOMPLETE_REQUESTING_CANCEL_CYCLES,
	AUTOCOMPLETE_SLOW_PROVIDER_ID,
	assertProviderBudgetObserved,
	assertRequestingCancelObserved,
} from "../suites/aiBenchHelpers";
import {
	aiBenchmarks,
	createProviderBudgetRunner,
	createRequestingCancelChurnRunner,
} from "../suites/ai.bench";

describe("autocomplete observation after the clock", () => {
	it("observation fails when requesting-cancel never requested", () => {
		expect(() =>
			assertRequestingCancelObserved({
				cycleCount: AUTOCOMPLETE_REQUESTING_CANCEL_CYCLES,
				requestCount: 0,
				cancelCount: 0,
				modelCallCount: 0,
			}),
		).toThrow(
			/autocomplete requesting-cancel bench requestCount 0 !== cycleCount 10/,
		);
	});

	it("a skipped requesting-cancel loop refuses to publish", async () => {
		const runner = createRequestingCancelChurnRunner({ skipRequests: true });
		await expect(
			bench("ai.autocomplete-requesting-cancel-churn no-op", runner.fn, {
				iterations: 1,
				warmup: 0,
			}),
		).rejects.toThrow(
			/autocomplete requesting-cancel bench requestCount 0 !== cycleCount 10/,
		);
	});

	it("observation fails when provider-budget never called the model", () => {
		expect(() =>
			assertProviderBudgetObserved({
				providerTimings: [],
				modelCallCount: 0,
				maxProviderChars: AUTOCOMPLETE_PROVIDER_BUDGET_MAX_CHARS,
			}),
		).toThrow(/autocomplete provider-budget bench model was never called/);
	});

	it("a skipped provider-budget request refuses to publish", async () => {
		const runner = createProviderBudgetRunner({ skipRequest: true });
		await expect(
			bench("ai.autocomplete-provider-budget no-op", runner.fn, {
				iterations: 1,
				warmup: 0,
			}),
		).rejects.toThrow(
			/autocomplete provider-budget bench model was never called/,
		);
	});

	it("observation fails when the slow provider survived the budget", () => {
		expect(() =>
			assertProviderBudgetObserved({
				providerTimings: [
					{ id: AUTOCOMPLETE_LOCAL_PROVIDER_ID, chars: 16 },
					{ id: AUTOCOMPLETE_SLOW_PROVIDER_ID, chars: 8 },
				],
				modelCallCount: 1,
				maxProviderChars: AUTOCOMPLETE_PROVIDER_BUDGET_MAX_CHARS,
			}),
		).toThrow(
			/autocomplete provider-budget bench included slow-timeout after the timeout budget/,
		);
	});

	it("the live requesting-cancel bench records counts and a yield floor", async () => {
		const definition = aiBenchmarks.find(
			(entry) => entry.id === AI_AUTOCOMPLETE_REQUESTING_CANCEL_CHURN_BENCH.id,
		);
		if (!definition) {
			throw new Error("ai.autocomplete-requesting-cancel-churn missing");
		}
		const [result] = await runSuite("ai-requesting-cancel", [definition], {
			iterations: 1,
			warmup: 0,
		});
		expect(result?.metrics).toMatchObject({
			cycleCount: AUTOCOMPLETE_REQUESTING_CANCEL_CYCLES,
			requestCount: AUTOCOMPLETE_REQUESTING_CANCEL_CYCLES,
			modelCallCount: AUTOCOMPLETE_REQUESTING_CANCEL_CYCLES,
		});
		expect(typeof result?.floorP50Ms).toBe("number");
	});

	it("the live provider-budget bench names local-shape and records the timeout floor", async () => {
		const definition = aiBenchmarks.find(
			(entry) => entry.id === AI_AUTOCOMPLETE_PROVIDER_BUDGET_BENCH.id,
		);
		if (!definition) {
			throw new Error("ai.autocomplete-provider-budget missing");
		}
		const [result] = await runSuite("ai-provider-budget", [definition], {
			iterations: 1,
			warmup: 0,
		});
		expect(result?.metrics?.slowProviderIncluded).toBe(false);
		expect(result?.metrics?.modelCallCount).toBe(1);
		expect(typeof result?.floorP50Ms).toBe("number");
	});
});
