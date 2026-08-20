import type { Editor } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { facetDepName } from "../facets/compute";
import { createFacetRegistry, defineFacet } from "../facets/registry";

function fakeEditor(): Editor {
	return { clientId: 1 } as Editor;
}

describe("facet compute", () => {
	it("R3: document deps recompute on non-empty commits only", () => {
		let calls = 0;
		const facet = defineFacet<number, number>({
			name: "test.document",
			combine: (inputs) => inputs[0] ?? 0,
		});
		const registry = createFacetRegistry({
			editor: fakeEditor(),
			providers: [
				facet.compute(["document"], () => {
					calls += 1;
					return calls;
				}),
			],
		});
		registry.markReady();
		expect(calls).toBe(1);
		expect(registry.read(facet)).toBe(1);

		registry.settle({ commitId: 1, emptyCommit: true });
		expect(calls).toBe(1);
		expect(registry.read(facet)).toBe(1);

		registry.settle({ commitId: 2 });
		expect(calls).toBe(2);
		expect(registry.read(facet)).toBe(2);

		registry.settle({ commitId: 2 });
		expect(calls).toBe(2);
	});

	it("R3: selection deps recompute when the selection version changes", () => {
		let calls = 0;
		const facet = defineFacet<number, number>({
			name: "test.selection",
			combine: (inputs) => inputs[0] ?? 0,
		});
		const registry = createFacetRegistry({
			editor: fakeEditor(),
			providers: [
				facet.compute(["selection"], () => {
					calls += 1;
					return calls;
				}),
			],
		});
		registry.markReady();
		expect(calls).toBe(1);

		registry.settle({ selectionVersion: 1 });
		expect(calls).toBe(2);
		registry.settle({ selectionVersion: 1 });
		expect(calls).toBe(2);
		registry.settle({ selectionVersion: 2 });
		expect(calls).toBe(3);
	});

	it("R3: facet-dep providers recompute when a dependency output changes", () => {
		let sourceValue = 1;
		let derivedCalls = 0;
		const source = defineFacet<number, number>({
			name: "test.source",
			combine: (inputs) => inputs[0] ?? 0,
		});
		const derived = defineFacet<number, number>({
			name: "test.derived",
			combine: (inputs) => inputs[0] ?? 0,
		});
		const registry = createFacetRegistry({
			editor: fakeEditor(),
			providers: [
				source.compute(["document"], () => sourceValue),
				derived.compute([source], () => {
					derivedCalls += 1;
					return sourceValue * 2;
				}),
			],
		});
		registry.markReady();
		expect(derivedCalls).toBe(1);
		expect(registry.read(derived)).toBe(2);

		registry.settle({ commitId: 1 });
		expect(derivedCalls).toBe(1);

		sourceValue = 4;
		registry.settle({ commitId: 2 });
		expect(derivedCalls).toBe(2);
		expect(registry.read(derived)).toBe(8);
	});

	it("R4: equal recomputed input skips combine", () => {
		let combines = 0;
		const token = { n: 1 };
		const facet = defineFacet<{ n: number }, { n: number }>({
			name: "test.skip-combine",
			combine: (inputs) => {
				combines += 1;
				return inputs[0] ?? { n: 0 };
			},
		});
		const registry = createFacetRegistry({
			editor: fakeEditor(),
			providers: [facet.compute(["document"], () => token)],
		});
		registry.markReady();
		expect(combines).toBe(1);

		for (let commitId = 1; commitId <= 8; commitId += 1) {
			registry.settle({ commitId });
		}
		expect(combines).toBe(1);
		expect(registry.read(facet)).toBe(token);
	});

	it("R4 / I8: equal output keeps the previous object across 100 commits", () => {
		const facet = defineFacet<{ n: number }, { n: number }>({
			name: "test.stable",
			combine: (inputs) => ({ n: inputs[0]?.n ?? 0 }),
			compareOutput: (a, b) => a.n === b.n,
		});
		const registry = createFacetRegistry({
			editor: fakeEditor(),
			providers: [facet.compute(["document"], () => ({ n: 1 }))],
		});
		registry.markReady();
		const first = registry.read(facet);

		for (let commitId = 1; commitId <= 100; commitId += 1) {
			registry.settle({ commitId });
			expect(registry.read(facet)).toBe(first);
		}
	});

	it("facetDepName maps document/selection to null and facets to name", () => {
		const facet = defineFacet<string, string>({
			name: "test.named",
			combine: (inputs) => inputs[0] ?? "",
		});
		expect(facetDepName("document")).toBeNull();
		expect(facetDepName("selection")).toBeNull();
		expect(facetDepName(facet)).toBe("test.named");
	});
});
