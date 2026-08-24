import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Copied from ai-autocomplete/src/__tests__/, where "../.." was the satellite
// package root. This file now lives one directory deeper
// (ai/src/autocomplete/__tests__/), so the merged package root is "../../..".
// "../.." would resolve to ai/src/, which has no package.json.
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC_ROOT = join(PACKAGE_ROOT, "src");

const MODULE_SCOPE_PROTOTYPE_ASSIGN =
	/^[A-Za-z_$][\w$]*\.prototype(?:\.[A-Za-z_$][\w$]*)?\s*=/m;
const MODULE_SCOPE_PROTOTYPE_ASSIGN_OBJECT =
	/^Object\.assign\s*\(\s*[A-Za-z_$][\w$]*\.prototype/m;

function listTypeScriptSources(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "__tests__") {
				continue;
			}
			files.push(...listTypeScriptSources(path));
			continue;
		}
		if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) {
			continue;
		}
		files.push(path);
	}
	return files;
}

describe("@input/pen-ai/autocomplete packaging", () => {
	it("CH1: source files do not assign to .prototype at module scope and sideEffects is false", () => {
		const manifest = JSON.parse(
			readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
		) as { sideEffects: unknown };

		expect(manifest.sideEffects).toBe(false);

		const hits: string[] = [];
		for (const file of listTypeScriptSources(SRC_ROOT)) {
			const source = readFileSync(file, "utf8");
			if (
				MODULE_SCOPE_PROTOTYPE_ASSIGN.test(source) ||
				MODULE_SCOPE_PROTOTYPE_ASSIGN_OBJECT.test(source)
			) {
				hits.push(file);
			}
		}

		expect(hits).toEqual([]);
	});
});
