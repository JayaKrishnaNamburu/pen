import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TableGridExecutor } from "../editor/tableGridExecutor";

const repoRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../../..",
);

describe("API9 core scope", () => {
	it("API9: table executors still live in core and the v2.1 deferral note exists", () => {
		expect(typeof TableGridExecutor.prototype.execute).toBe("function");

		const packaging = readFileSync(
			resolve(repoRoot, "spec/rules/api.md"),
			"utf8",
		);
		expect(packaging).toContain(
			"API9. Table grid execution stays with the table block",
		);
		expect(packaging).toContain("deferred to v2.1");
	});
});
