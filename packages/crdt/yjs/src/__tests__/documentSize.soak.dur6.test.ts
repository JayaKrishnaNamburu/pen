import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter";
import { initBlockMap } from "../document";
import type { YjsCRDTDocument } from "../document";
import { measureDocumentSize } from "../documentSize";

const SOAK_CYCLES = 10_000;
const SAMPLE_EVERY = 1_000;

interface SizeTrendSample {
	readonly cycle: number;
	readonly encodedByteSize: number;
	readonly blockCount: number;
	readonly gcEnabled: boolean;
}

describe("document-size soak (DUR6)", () => {
	it("DUR6: records encoded-size trend across 10k edit/delete cycles without a budget", () => {
		const adapter = yjsAdapter();
		const doc = adapter.createDocument() as YjsCRDTDocument;
		adapter.transact(doc, () => {
			initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
			doc.penDocument.blockOrder.push(["b1"]);
		});

		const text = doc.penDocument.blocks.get("b1")!.get("content") as Y.Text;
		const trend: SizeTrendSample[] = [];

		const record = (cycle: number) => {
			const size = measureDocumentSize(doc.ydoc);
			trend.push({
				cycle,
				encodedByteSize: size.encodedByteSize,
				blockCount: size.blockCount,
				gcEnabled: size.gcEnabled,
			});
		};

		record(0);

		for (let cycle = 1; cycle <= SOAK_CYCLES; cycle++) {
			adapter.transact(doc, () => {
				text.insert(0, "x");
				text.delete(0, 1);
			});
			if (cycle % SAMPLE_EVERY === 0) {
				record(cycle);
			}
		}

		expect(trend.map((sample) => sample.cycle)).toEqual([
			0, 1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000,
			10_000,
		]);
		expect(trend.every((sample) => sample.blockCount === 1)).toBe(true);
		expect(trend.every((sample) => sample.gcEnabled === false)).toBe(true);
		expect(
			trend.every((sample) => sample.encodedByteSize > 0),
		).toBe(true);
	});
});
