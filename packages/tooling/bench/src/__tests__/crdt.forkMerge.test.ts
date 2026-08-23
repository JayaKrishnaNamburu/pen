import type { YjsCRDTDocument } from "@input/pen-crdt-yjs";
import { describe, expect, it } from "vitest";
import { bench, runSuite } from "../bench";
import { CRDT_FORK_MERGE_100_BENCH } from "../constants/benchmarks";
import {
	FORK_MERGE_BLOCK_COUNT,
	FORK_MERGE_BLOCK_ID,
	FORK_MERGE_TOKEN,
	assertForkDiverged,
	assertMergeTransferred,
	createDivergedFork,
	insertBlockToken,
	readBlockText,
} from "../fixtures/crdtForkMerge";
import { createLargeDocument } from "../fixtures/largeDoc";
import { createForkMergeRunner, crdtBenchmarks } from "../suites/crdt.bench";

describe("crdt.fork-merge-100 observation", () => {
	it("the fork holds the named token and the target does not", () => {
		const { doc, forked } = createDivergedFork();
		expect(doc.penDocument.blockOrder.length).toBe(FORK_MERGE_BLOCK_COUNT);
		expect(readBlockText(doc, FORK_MERGE_BLOCK_ID)).not.toContain(
			FORK_MERGE_TOKEN,
		);
		expect(readBlockText(forked, FORK_MERGE_BLOCK_ID)).toContain(
			FORK_MERGE_TOKEN,
		);
	});

	it("observation fails when the fork never diverged", () => {
		const { doc, adapter } = createLargeDocument(FORK_MERGE_BLOCK_COUNT);
		const forked = adapter.fork!(doc) as YjsCRDTDocument;
		expect(() =>
			assertForkDiverged(
				doc,
				forked,
				FORK_MERGE_BLOCK_ID,
				FORK_MERGE_TOKEN,
			),
		).toThrow(/documents did not diverge/);
	});

	it("observation fails when the token is already on the target", () => {
		const { doc, adapter } = createLargeDocument(FORK_MERGE_BLOCK_COUNT);
		insertBlockToken(adapter, doc, FORK_MERGE_BLOCK_ID, FORK_MERGE_TOKEN);
		const forked = adapter.fork!(doc) as YjsCRDTDocument;
		expect(() =>
			assertForkDiverged(
				doc,
				forked,
				FORK_MERGE_BLOCK_ID,
				FORK_MERGE_TOKEN,
			),
		).toThrow(/already present on target block block-50/);
	});

	it("observation fails when merge is skipped", () => {
		const { doc } = createDivergedFork();
		expect(() =>
			assertMergeTransferred(doc, FORK_MERGE_BLOCK_ID, FORK_MERGE_TOKEN),
		).toThrow(/merge did not transfer FORK-MERGE-TOKEN onto target block block-50/);
	});

	it("a no-op merge refuses to publish the fork-merge bench", async () => {
		const runner = createForkMergeRunner({ merge: false });
		await expect(
			bench("crdt.fork-merge-100 no-op", runner.fn, {
				iterations: 1,
				warmup: 0,
			}),
		).rejects.toThrow(
			/merge did not transfer FORK-MERGE-TOKEN onto target block block-50/,
		);
	});

	it("the live bench transfers the named token and records the floor", async () => {
		const definition = crdtBenchmarks.find(
			(entry) => entry.id === CRDT_FORK_MERGE_100_BENCH.id,
		);
		if (!definition) {
			throw new Error("crdt.fork-merge-100 missing");
		}
		const [result] = await runSuite("crdt-fork-merge", [definition], {
			iterations: 1,
			warmup: 0,
		});
		expect(result?.metrics).toMatchObject({
			blockCount: FORK_MERGE_BLOCK_COUNT,
			namedBlock: FORK_MERGE_BLOCK_ID,
			tokenLength: FORK_MERGE_TOKEN.length,
		});
		expect(typeof result?.floorP50Ms).toBe("number");
		expect(typeof result?.attributedP50Ms).toBe("number");
	});
});
