import { describe, expect, it } from "vitest";
import type { ModelAdapter } from "@input/pen-types";
import {
	getBlockAdapter,
	listBlockAdapters,
	resolveBlockAdapter,
} from "../runtime/blockAdapters";
import { supportsStructuredIntent } from "../helpers";

/**
 * UC3 rests on a reachability claim: the structured plan pipeline has exactly
 * one producer, and that producer parses assistant text. If a second producer
 * ever appears, the claim is void and these tests must fail before the
 * pipeline is deleted (`spec-v5/01-channel.md` UC3).
 */
describe("UC3: the structured plan pipeline has one producer", () => {
	it("UC3: every registered block adapter carries the flow-text transport", () => {
		const adapters = listBlockAdapters();
		expect(adapters.length).toBeGreaterThan(0);
		for (const adapter of adapters) {
			expect(adapter.transportKind).toBe("flow-text");
		}
	});

	it("UC3: adapter resolution cannot yield a non-flow-text transport", () => {
		const targets = ["selection", "block"] as const;
		const targetKinds = ["text", "block", "table"] as const;
		for (const target of targets) {
			for (const targetKind of targetKinds) {
				const adapter = resolveBlockAdapter({
					target,
					targetKind,
					activeBlockType: target === "block" ? "paragraph" : null,
					mutationMode: "direct",
				} as never);
				expect(adapter.transportKind).toBe("flow-text");
			}
		}
		expect(getBlockAdapter("flow-markdown").transportKind).toBe("flow-text");
	});

	/**
	 * `useStructuredIntentTransport` in `controller/generationExecution.ts` is
	 * `adapter.transportKind !== "flow-text" && supportsStructuredIntent(model)`.
	 * The left side is false for every reachable adapter, so no model
	 * capability can open the transport — the plan can only come from the text
	 * parse.
	 */
	it("UC3: no model capability can open the structured intent transport", () => {
		const structuredIntentModel = {
			capabilities: { structuredIntent: true },
			async *stream() {},
		} as unknown as ModelAdapter;
		expect(supportsStructuredIntent(structuredIntentModel)).toBe(true);
		for (const adapter of listBlockAdapters()) {
			const transportOpen =
				adapter.transportKind !== "flow-text" &&
				supportsStructuredIntent(structuredIntentModel);
			expect(transportOpen).toBe(false);
		}
	});
});
