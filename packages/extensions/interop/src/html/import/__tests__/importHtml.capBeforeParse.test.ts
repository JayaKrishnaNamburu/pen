import { describe, expect, it } from "vitest";
import {
	INGEST_MAX_TEXT_SIZE,
	IngestDropCounts,
	capRawHtmlSource,
} from "../ingestBounds";

describe("IOP5 HTML ingest pre-parse cap", () => {
	it("IOP5 capRawHtmlSource admits at most INGEST_MAX_TEXT_SIZE code units from a 2×-cap source", () => {
		const keep = "<p>keep</p>\n";
		const later = "<p>later</p>";
		const input2x = `${keep}${"x".repeat(INGEST_MAX_TEXT_SIZE * 2)}\n${later}`;
		const drops = new IngestDropCounts();
		const admitted = capRawHtmlSource(input2x, drops);

		expect(input2x.length).toBeGreaterThan(INGEST_MAX_TEXT_SIZE);
		expect(admitted.length).toBeLessThanOrEqual(INGEST_MAX_TEXT_SIZE);
		expect(admitted.includes("later")).toBe(false);
		expect(drops.toDroppedByReason()[0]).toMatchObject({
			reason: "text-size-exceeded",
			bound: "INGEST_MAX_TEXT_SIZE",
			limit: INGEST_MAX_TEXT_SIZE,
			actual: input2x.length,
		});
	});
});
