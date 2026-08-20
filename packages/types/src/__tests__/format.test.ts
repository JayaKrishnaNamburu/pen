import { describe, expect, it } from "vitest";
import {
	DOCUMENT_PROFILE_METADATA_KEY,
	IMPLICIT_V1_FORMAT_STAMP,
	MIGRATION_LEDGER_METADATA_KEY,
	PEN_DOCUMENT_FORMAT,
	PEN_FORMAT_METADATA_KEY,
	PenDocumentUnreadableError,
	RESERVED_METADATA_KEYS,
} from "../types/format";

describe("document format contracts (DUR1)", () => {
	it("DUR1: freezes the store generation at 2 with minReader 1 for implicit v1 stamps", () => {
		expect(PEN_DOCUMENT_FORMAT).toBe(2);
		expect(IMPLICIT_V1_FORMAT_STAMP).toEqual({
			format: 1,
			minReader: 1,
			writer: "unknown",
		});
	});

	it("DUR1/DUR4: reserves penFormat, documentProfile, and the migration ledger", () => {
		expect(RESERVED_METADATA_KEYS).toEqual([
			PEN_FORMAT_METADATA_KEY,
			DOCUMENT_PROFILE_METADATA_KEY,
			MIGRATION_LEDGER_METADATA_KEY,
		]);
		expect(Object.isFrozen(RESERVED_METADATA_KEYS)).toBe(true);
		expect(PEN_FORMAT_METADATA_KEY).toBe("penFormat");
		expect(DOCUMENT_PROFILE_METADATA_KEY).toBe("documentProfile");
		expect(MIGRATION_LEDGER_METADATA_KEY).toBe("penMigrations");
	});

	it("DUR2: PenDocumentUnreadableError carries the stamp and reason", () => {
		const error = new PenDocumentUnreadableError(
			{ format: 2, minReader: 3, writer: "future" },
			"minReader 3 exceeds reader format 2",
		);
		expect(error.name).toBe("PenDocumentUnreadableError");
		expect(error.stamp.minReader).toBe(3);
		expect(error.reason).toContain("minReader");
	});
});
