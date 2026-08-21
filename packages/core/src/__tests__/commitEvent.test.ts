import { describe, expect, it } from "vitest";

import { resolveCommitSource, toStructuredOrigin } from "../editor/commitEvent";

describe("commitEvent helpers (Wave 2.2)", () => {
	it("toStructuredOrigin wraps string origins", () => {
		expect(toStructuredOrigin("user")).toEqual({ type: "user" });
		expect(toStructuredOrigin({ type: "ai", requestId: "r1" })).toEqual({
			type: "ai",
			requestId: "r1",
		});
	});

	it("toStructuredOrigin returns the same structured object it was given", () => {
		const origin = { type: "user" as const, groupId: "g1", requestId: "r1" };
		const frozen = Object.freeze({
			type: "ai" as const,
			requestId: "r2",
		});
		const extra = {
			type: "user" as const,
			unexpected: "field",
		};

		expect(toStructuredOrigin(origin)).toBe(origin);
		expect(toStructuredOrigin(frozen)).toBe(frozen);
		expect(toStructuredOrigin(extra)).toBe(extra);
		expect(toStructuredOrigin(extra)).toEqual({
			type: "user",
			unexpected: "field",
		});
	});

	it("resolveCommitSource maps history / collaborator / stream", () => {
		expect(resolveCommitSource("user", "apply")).toBe("apply");
		expect(resolveCommitSource("collaborator", "apply")).toBe("remote");
		expect(resolveCommitSource("history", "apply")).toBe("undo");
		expect(resolveCommitSource({ type: "history" }, "apply")).toBe("undo");
		expect(
			resolveCommitSource({ type: "history", source: "redo" }, "apply"),
		).toBe("redo");
		expect(
			resolveCommitSource({ type: "ai", source: "stream" }, "apply"),
		).toBe("stream");
		expect(resolveCommitSource("user", "remote")).toBe("remote");
	});
});
