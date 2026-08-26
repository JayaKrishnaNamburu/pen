#!/usr/bin/env node
/**
 * SEC5 red-proof (spec/rules/reliability.md GA3, wave-1 GATE 1.4).
 *
 * Seeds a markup template literal with an unescaped interpolation inside
 * the retargeted rule's population and asserts eslint reports
 * pen/no-unescaped-markup-concat against it. The rule visits
 * TemplateLiteral nodes only, so the fixture must be a template literal;
 * `+` concatenation into markup is a separate question and deliberately
 * not smuggled in here (see the 2026-08-25 correction in the wave file).
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
const fixture = path.join(
	repoRoot,
	"packages/extensions/interop/src/__i15_sec5_fixture.ts",
);

fs.writeFileSync(
	fixture,
	"export function bad(userContent: string){ return `<div>${userContent}`; }\n",
);

let output = "";
let code = 0;
try {
	output = execSync(`pnpm exec eslint ${fixture} --no-ignore 2>&1`, {
		cwd: repoRoot,
	}).toString();
} catch (error) {
	code = error.status;
	output = String(error.stdout ?? "");
} finally {
	fs.unlinkSync(fixture);
}

if (code !== 0 && output.includes("no-unescaped-markup-concat")) {
	console.log("SEC5 ok: the retargeted rule fails a seeded interpolation");
	process.exit(0);
}

console.error(
	"SEC5 red-proof did not fire — the rule did not report the seeded fixture",
);
console.error(output);
process.exit(1);
