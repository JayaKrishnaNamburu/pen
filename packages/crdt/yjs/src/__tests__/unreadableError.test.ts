import { describe, expect, it } from "vitest";
import { PenDocumentUnreadableError } from "../unreadableError";

describe("PenDocumentUnreadableError (DUR2)", () => {
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
