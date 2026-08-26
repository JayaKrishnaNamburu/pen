import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const assertScript = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../fixtures/rsc/assert-client-boundary.mjs",
);

describe("client boundary (HOST1)", () => {
	it("HOST1: published ESM and CJS entries keep use client after tsup", () => {
		const result = spawnSync("node", [assertScript], { encoding: "utf8" });
		expect(result.status, result.stderr || result.stdout).toBe(0);
		expect(result.stdout).toContain("HOST1");
	});
});
