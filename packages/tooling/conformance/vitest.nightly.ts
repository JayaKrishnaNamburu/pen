import { globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// Explicit include, pinned against the workspace `*.properties.test.ts` set
// (spec-v2/09-reliability-testing.md: pin the list against the source).
// Each file must honour PEN_FUZZ_NIGHTLY, PEN_FUZZ_SEED (incl. hyphenated
// nightly seeds), and PEN_FUZZ_OP_COUNT. A new properties file fails this
// config at load until it is added here *and* given that plumbing.
const include = [
	"packages/core/src/__tests__/changeSummaries.properties.test.ts",
	"packages/core/src/__tests__/unknownContent.dur3.properties.test.ts",
	"packages/extensions/undo/src/__tests__/commitEvent.i1.properties.test.ts",
];

const discovered = globSync("packages/**/*.properties.test.ts", {
	cwd: repoRoot,
})
	.map((entry) => entry.split(path.sep).join("/"))
	.sort();
const includeSorted = [...include].sort();
if (
	discovered.length === 0 ||
	discovered.join("\n") !== includeSorted.join("\n")
) {
	throw new Error(
		`vitest.nightly include is not the workspace property-suite set (${discovered.length} discovered, ${include.length} listed).\n` +
			`discovered:\n${discovered.join("\n") || "(none)"}\n` +
			`include:\n${includeSorted.join("\n")}`,
	);
}

console.log(
	`nightly property include: ${include.length} files\n${include.join("\n")}\nPEN_FUZZ_NIGHTLY=${process.env.PEN_FUZZ_NIGHTLY ?? "(unset)"} PEN_FUZZ_SEED=${process.env.PEN_FUZZ_SEED ?? "(default)"}`,
);

export default defineConfig({
	root: repoRoot,
	test: {
		name: "wave0-properties",
		include,
		// changeSummaries: I2/I3, A5 collapsed mapRange, Hebrew/Arabic UTF-16 (1M ops).
		// unknownContent: DUR3 unknown-block passthrough (80 cases).
		// commitEvent: I1 one commit per state change (2000 steps).
		testTimeout: 1_800_000,
	},
});
