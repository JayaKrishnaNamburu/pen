/**
 * SF3 closed package list (spec/rules/api.md).
 *
 * After the SF1/SF2 merges the workspace package list (named manifests
 * under packages/, private included) must equal the closed no-merge list
 * plus the two merge targets. Extending that list is a spec amendment.
 *
 * Enumeration is loadTaskGraphPackages — the same recursive packages/
 * walk workspace-pins and the DAG check use. Do not invent a third walker.
 *
 * Frozen 2026-08-24 from that walk minus the twelve SF1/SF2 satellites
 * minus @input/pen-ai. Re-derive only if 05-surface.md is amended.
 *
 * This pin replaced scripts/sf3-package-list-check.mjs when the structure train
 * GA13 retired the one-shot (
 * Step 1.7: the pin moves to a test before the script dies).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadTaskGraphPackages } from "../../../../../scripts/dag-check.mjs";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

const MERGE_TARGETS = ["@input/pen-ai", "@input/pen-interop"];

const CLOSED_NO_MERGE = [
	"@input/pen-assets",
	"@input/pen-bench",
	"@input/pen-conformance",
	"@input/pen-ingest",
	"@input/pen-core",
	"@input/pen-yjs",
	"@input/pen-docs",
	"@input/pen-tools",
	"@input/pen-dom",
	"@input/pen-eslint-plugin",
	"@input/pen-snapshots",
	"@input/pen-autoformat",
	"@input/pen-markdown",
	"@input/pen-multiplayer",
	"@input/pen",
	"@input/pen-react",
	"@input/pen-schema",
	"@input/pen-search",
	"@input/pen-shortcuts",
	"@input/pen-test",
	"@input/pen-transport",
	"@input/pen-types",
	"@input/pen-undo",
	"@input/pen-vue",
];

test("SF3: the workspace package list is the closed no-merge list plus the two merge targets", async () => {
	const packages = await loadTaskGraphPackages(repoRoot);
	assert.ok(
		packages.length > 0,
		"packages/**/package.json walk matched 0 files",
	);

	const live = [...new Set(packages.map((pkg) => pkg.name))].sort();
	const expected = [...new Set([...CLOSED_NO_MERGE, ...MERGE_TARGETS])].sort();

	const unexpected = live.filter((name) => !expected.includes(name));
	const missing = expected.filter((name) => !live.includes(name));

	assert.deepEqual(
		unexpected,
		[],
		"package(s) not on the closed SF3 list plus merge targets",
	);
	assert.deepEqual(
		missing,
		[],
		"package(s) required by the closed SF3 list plus merge targets",
	);
	console.log(`SF3 → ${live.length} workspace packages`);
});

test("SF3: a satellite name on the closed list is a merge that did not happen", () => {
	const satellites = [
		"@input/pen-ai-suggestions",
		"@input/pen-ai-autocomplete",
		"@input/pen-ai-skills",
		"@input/pen-ai-tools",
		"@input/pen-delta-stream",
		"@input/pen-export-html",
		"@input/pen-export-json",
		"@input/pen-export-markdown",
		"@input/pen-export-xml",
		"@input/pen-import-html",
		"@input/pen-import-json",
		"@input/pen-import-markdown",
	];
	assert.deepEqual(
		satellites.filter((name) => CLOSED_NO_MERGE.includes(name)),
		[],
	);
});
