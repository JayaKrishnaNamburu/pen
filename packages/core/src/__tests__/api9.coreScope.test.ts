import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TableGridExecutor } from "../editor/tableGridExecutor";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("API9 core scope", () => {
	it("API9: table executors still live in core and the v2.1 deferral note exists", () => {
		expect(typeof TableGridExecutor.prototype.execute).toBe("function");

		const packaging = readFileSync(
			resolve(repoRoot, "spec-v2/14-api-and-packaging.md"),
			"utf8",
		);
		expect(packaging).toContain("### API9: Core scope (recorded, deferred)");
		expect(packaging).toContain("table grid execution");
		expect(packaging).toContain("Table extraction is deferred to v2.1.");
	});
});
