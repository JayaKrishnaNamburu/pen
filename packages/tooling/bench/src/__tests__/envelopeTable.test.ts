import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ENVELOPE_SAMPLE_SIZE, SCALE1_MEASUREMENTS } from "../constants/scale1";
import { envelopeTablePath, loadCommittedEnvelope } from "../envelope/compare";
import { renderEnvelopeMarkdown } from "../envelope/table";
import { RELATED_FIXTURE_AUDIT, SCALE1_FIXTURE_AUDIT } from "../fixtures/audit";

describe("SCALE1 generated envelope table", () => {
	it("SCALE1: committed table is generated from the envelope record", async () => {
		const record = await loadCommittedEnvelope();
		const committed = await readFile(envelopeTablePath(), "utf8");
		expect(committed).toBe(renderEnvelopeMarkdown(record));
	});

	it("SCALE1: table states the fixture audit and the harness floor per rung", async () => {
		const record = await loadCommittedEnvelope();
		const markdown = renderEnvelopeMarkdown(record);

		expect(markdown).toMatch(/Status: provisional/);
		expect(markdown).toMatch(/Fixture audit/);
		expect(markdown).toMatch(/name-overstates/);
		expect(markdown).toMatch(/wrong-subject/);
		expect(markdown).toMatch(/100 `setTimeout\(0\)`/);
		expect(markdown).toMatch(/Peer B does not write/);
		expect(markdown).toMatch(/How measured/);
		expect(markdown).toMatch(/B observation asserted before the clock/);

		for (const spec of SCALE1_MEASUREMENTS) {
			expect(markdown).toContain(`\`${spec.id}\``);
		}
		for (const row of [...SCALE1_FIXTURE_AUDIT, ...RELATED_FIXTURE_AUDIT]) {
			expect(markdown).toContain(row.verdict);
			expect(markdown).toContain(row.howMeasured);
		}
		for (const point of record.points) {
			expect(markdown).toContain(point.floorKind);
			expect(Number.isFinite(point.floorP50Ms)).toBe(true);
			expect(point.attributedP50Ms).toBe(
				Math.round(
					Math.max(0, point.measuredP50Ms - point.floorP50Ms) * 100,
				) / 100,
			);
		}

		expect(record.sampleSize).toBe(ENVELOPE_SAMPLE_SIZE);
		expect(record.points).toHaveLength(SCALE1_MEASUREMENTS.length);
		expect(record.status).toBe("provisional");
	});

	it("SCALE1: block-count ladder has three rungs so the curve is visible", async () => {
		const record = await loadCommittedEnvelope();
		const blocks = record.points.filter(
			(point) => point.axis === "blockCount",
		);
		expect(blocks.map((point) => point.id)).toEqual([
			"blocks-100",
			"blocks-1000",
			"blocks-5000",
		]);
		expect(blocks[0]!.attributedP50Ms).toBeLessThan(
			blocks[1]!.attributedP50Ms,
		);
		expect(blocks[1]!.attributedP50Ms).toBeLessThan(
			blocks[2]!.attributedP50Ms,
		);
	});
});
