#!/usr/bin/env node
/**
 * GA12 population check.
 *
 * turbo.json carries no `lint` task, and every workspace package under
 * packages/ answers `pnpm --filter … lint`. Stated as a set difference
 * over the measured population rather than a spot-check of one manifest.
 *
 * turbo.json is JSONC — turbo accepts comments and Wave 0's TR8 fix left
 * one — so line comments are stripped before parsing.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
);

const turboSource = fs
	.readFileSync(path.join(repoRoot, "turbo.json"), "utf8")
	.split("\n")
	.filter((line) => !line.trimStart().startsWith("//"))
	.join("\n");

if (JSON.parse(turboSource).tasks?.lint) {
	console.error("turbo.json still declares a lint task");
	process.exit(1);
}

const manifests = execSync(
	"rg --files packages --glob 'package.json' --glob '!**/node_modules/**' --glob '!**/dist/**'",
	{ cwd: repoRoot, encoding: "utf8" },
)
	.trim()
	.split("\n");

const holes = manifests.filter(
	(manifest) =>
		!JSON.parse(fs.readFileSync(path.join(repoRoot, manifest), "utf8"))
			.scripts?.lint,
);

if (holes.length > 0) {
	console.error("no lint script:", holes.join(" "));
	process.exit(1);
}

console.log("packages checked", manifests.length);
