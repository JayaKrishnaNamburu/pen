#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const globs = [
	"packages/core/src/editor/selection.ts",
	"packages/core/src/editor/selection*.ts",
	"packages/rendering/dom/src/field-editor/selection*.ts",
];

const result = spawnSync(
	"rg",
	["-n", "setTimeout|requestAnimationFrame|setImmediate", ...globs],
	{ cwd: repoRoot, encoding: "utf8" },
);

if (result.status === 0 && result.stdout.trim().length > 0) {
	console.error("S4 lint failed — timers in selection modules:\n" + result.stdout);
	process.exit(1);
}

if (result.status !== 0 && result.status !== 1) {
	console.error(result.stderr || "S4 lint: rg failed");
	process.exit(result.status ?? 1);
}

console.log("S4 lint ok — no timers in selection modules");
