#!/usr/bin/env node
/**
 * H.9 CH1–CH9 blocking wrapper (spec/rules/reliability.md).
 *
 * Runs `ch-gates.mjs` (CH1–CH6, plus CH8/CH9 host links) and the F22
 * dead-binding pin. CH3 lives in ch-gates — `skip-hygiene.mjs` is the
 * inventory/fixture reporter, not a second fail path. CH8/CH9 jobs stay
 * in bench.yml / flake.yml. Exits 1 when a required script is missing or
 * fails.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const REQUIRED_SCRIPTS = [
	"scripts/ch-gates.mjs",
	"scripts/f22-dead-bindings.mjs",
];

function exists(relPath) {
	return fs.existsSync(path.join(REPO_ROOT, relPath));
}

function readLintEslint() {
	try {
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
		);
		return packageJson.scripts?.["lint:eslint"] === "eslint .";
	} catch {
		return false;
	}
}

function hostChecks() {
	const checks = [
		{
			ok: exists("eslint.config.mjs") && readLintEslint(),
			line: `CH2  eslint.config.mjs ${exists("eslint.config.mjs") ? "present" : "missing"}; lint:eslint ${readLintEslint() ? "present" : "missing"}`,
		},
		{
			ok: exists(".github/workflows/bench.yml"),
			line: `CH8  .github/workflows/bench.yml ${exists(".github/workflows/bench.yml") ? "present" : "missing (H.7)"}`,
		},
		{
			ok: exists(".github/workflows/flake.yml"),
			line: `CH9  .github/workflows/flake.yml ${exists(".github/workflows/flake.yml") ? "present" : "missing (H.8)"}`,
		},
	];
	return checks;
}

function runScript(relPath) {
	if (!exists(relPath)) {
		return {
			file: relPath,
			status: 1,
			stdout: "",
			stderr: "",
			error: new Error(`missing ${relPath}`),
		};
	}
	const result = spawnSync(process.execPath, [path.join(REPO_ROOT, relPath)], {
		cwd: REPO_ROOT,
		encoding: "utf8",
		env: process.env,
		maxBuffer: 4 * 1024 * 1024,
	});
	return {
		file: relPath,
		status: result.error ? 1 : result.status,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		error: result.error,
	};
}

function writeStepSummary(markdown) {
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;
	if (!summaryPath) {
		return;
	}
	fs.appendFileSync(summaryPath, markdown);
}

function formatSummary({ ran, hosts, failed }) {
	const lines = [
		"## CH health gates (H.9)",
		"",
		failed ? "**Result:** fail" : "**Result:** pass",
		"",
		"```",
		...hosts.map((check) => check.line),
		"```",
		"",
		"### Scripts",
	];

	for (const item of ran) {
		const status =
			item.status === 0 ? "exit 0" : `exit ${item.status ?? "error"}`;
		lines.push(`- ran \`${item.file}\` (${status})`);
	}

	return `${lines.join("\n")}\n`;
}

function printItem(item) {
	console.log(`--- ${item.file} (exit ${item.status}) ---`);
	if (item.stdout.trim().length > 0) {
		console.log(item.stdout.trimEnd());
	}
	if (item.stderr.trim().length > 0) {
		console.error(item.stderr.trimEnd());
	}
	if (item.error) {
		console.error(item.error.message);
	}
	console.log("");
}

function main() {
	const ran = REQUIRED_SCRIPTS.map((file) => runScript(file));
	for (const item of ran) {
		printItem(item);
	}

	const hosts = hostChecks();
	const hostFailed = hosts.some((check) => !check.ok);
	const scriptFailed = ran.some((item) => item.status !== 0);
	const failed = hostFailed || scriptFailed;

	console.log(failed ? "CH health gates (H.9) — FAIL" : "CH health gates (H.9) — PASS");
	console.log("");
	for (const check of hosts) {
		console.log(check.line);
	}

	writeStepSummary(formatSummary({ ran, hosts, failed }));
	if (failed) {
		process.exitCode = 1;
	}
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	main();
}
