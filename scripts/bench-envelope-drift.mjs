#!/usr/bin/env node
/**
 * SCALE1 envelope table drift gate.
 *
 * Regenerates packages/tooling/bench/ENVELOPE.md from
 * baselines/envelope.json plus the fixture audit and fails if the
 * committed markdown does not match. This is a table-diff, not a
 * timing gate: CH8 keeps wall-clock comparison in the isolated
 * bench job, and only on the same machine class.
 *
 * Fail-closed: a missing baseline, a missing table, or a renderer
 * error exits non-zero.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const result = spawnSync(
	"pnpm",
	[
		"--filter",
		"@input/pen-bench",
		"exec",
		"tsx",
		"src/envelope/writeTable.ts",
		"--check",
	],
	{
		cwd: root,
		stdio: "inherit",
	},
);

if (result.error) {
	console.error(result.error.message);
	process.exit(1);
}

process.exit(result.status === 0 ? 0 : 1);
