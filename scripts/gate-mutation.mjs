#!/usr/bin/env node
/**
 * Live mutation proofs for Wave P gates. Each case breaks the thing
 * the gate is named for and asserts a non-zero exit that names the
 * defect. Self-tests inside the gates are not enough — those can
 * stay green while main() swallows the same failure.
 *
 *   node scripts/gate-mutation.mjs
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const cases = [];

// Most cases prove a gate CAN FAIL. A few prove the mirror — that it can still
// PASS on valid input — because a gate stuck at red is as useless as one stuck
// at green, and reads as strict rather than broken. Pass `direction: "pass"`
// for those so the output does not label a green run "FAILS".
function record(name, ok, detail, direction = "fail") {
	cases.push({ name, ok, detail });
	const expected = direction === "pass" ? "PASSES" : "FAILS";
	const unexpected = direction === "pass" ? "CANNOT PASS" : "CANNOT FAIL";
	const mark = ok ? expected : unexpected;
	console.log(`${ok ? "ok" : "FAIL"}  ${name}  ${mark}  ${detail}`);
}

function runNode(script, args, cwd = REPO_ROOT) {
	const result = spawnSync(process.execPath, [script, ...args], {
		cwd,
		encoding: "utf8",
		env: process.env,
	});
	return {
		status: result.status ?? 1,
		out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
	};
}

function withTemp(prefix, write, fn) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	try {
		write(dir);
		return fn(dir);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

function proveSizeLimit() {
	const missing = withTemp("pen-size-missing-", () => {}, (dir) =>
		runNode(path.join(REPO_ROOT, "scripts/size-limit.mjs"), ["--repo-root", dir]),
	);
	record(
		"size-limit missing baseline",
		missing.status !== 0 && /missing \.size-limit\.baseline\.json/.test(missing.out),
		`exit ${missing.status}`,
	);

	const over = withTemp(
		"pen-size-over-",
		(dir) => {
			fs.mkdirSync(path.join(dir, "dist"), { recursive: true });
			fs.writeFileSync(
				path.join(dir, ".size-limit.baseline.json"),
				JSON.stringify({
					regressionPercent: 10,
					entries: [
						{
							name: "@input/pen-ai-tools",
							path: "dist/index.mjs",
							baselineBytes: 100,
							note: "Wave M AIB3.",
						},
					],
				}),
			);
			fs.writeFileSync(path.join(dir, "dist/index.mjs"), "x".repeat(400));
		},
		(dir) =>
			runNode(path.join(REPO_ROOT, "scripts/size-limit.mjs"), [
				"--repo-root",
				dir,
			]),
	);
	record(
		"size-limit over-ceiling",
		over.status !== 0 && /@input\/pen-ai-tools/.test(over.out),
		`exit ${over.status}`,
	);

	const waiver = withTemp(
		"pen-size-waiver-",
		(dir) => {
			fs.mkdirSync(path.join(dir, "dist"), { recursive: true });
			fs.writeFileSync(
				path.join(dir, ".size-limit.baseline.json"),
				JSON.stringify({
					regressionPercent: 10,
					entries: [
						{
							name: "@input/pen-types",
							path: "dist/index.mjs",
							baselineBytes: 100,
							note: "Measured from dist after a local build.",
						},
					],
				}),
			);
			fs.writeFileSync(path.join(dir, "dist/index.mjs"), "ok");
		},
		(dir) =>
			runNode(path.join(REPO_ROOT, "scripts/size-limit.mjs"), [
				"--repo-root",
				dir,
			]),
	);
	record(
		"size-limit unattributed note",
		waiver.status !== 0 && /does not name the Wave/.test(waiver.out),
		`exit ${waiver.status}`,
	);
}

function proveInstallScripts() {
	const missing = withTemp("pen-sec7-missing-", () => {}, (dir) =>
		runNode(path.join(REPO_ROOT, "scripts/no-install-scripts.mjs"), [
			"--repo-root",
			dir,
		]),
	);
	record(
		"no-install-scripts missing packages/",
		missing.status !== 0 && /missing packages\//.test(missing.out),
		`exit ${missing.status}`,
	);

	const empty = withTemp(
		"pen-sec7-empty-",
		(dir) => fs.mkdirSync(path.join(dir, "packages")),
		(dir) =>
			runNode(path.join(REPO_ROOT, "scripts/no-install-scripts.mjs"), [
				"--repo-root",
				dir,
			]),
	);
	record(
		"no-install-scripts zero published manifests",
		empty.status !== 0 && /no published manifests/.test(empty.out),
		`exit ${empty.status}`,
	);

	const postinstall = withTemp(
		"pen-sec7-post-",
		(dir) => {
			const pkgDir = path.join(dir, "packages", "evil");
			fs.mkdirSync(pkgDir, { recursive: true });
			fs.writeFileSync(
				path.join(pkgDir, "package.json"),
				JSON.stringify({
					name: "@input/pen-evil",
					scripts: { postinstall: "curl evil" },
				}),
			);
		},
		(dir) =>
			runNode(path.join(REPO_ROOT, "scripts/no-install-scripts.mjs"), [
				"--repo-root",
				dir,
			]),
	);
	record(
		"no-install-scripts postinstall",
		postinstall.status !== 0 && /install-time scripts/.test(postinstall.out),
		`exit ${postinstall.status}`,
	);
}

function proveCatalog() {
	const missing = withTemp("pen-loc1-missing-", () => {}, (dir) =>
		runNode(path.join(REPO_ROOT, "scripts/catalog-check.mjs"), [
			"--repo-root",
			dir,
		]),
	);
	record(
		"catalog-check missing catalog file",
		missing.status !== 0 && /missing catalog file/.test(missing.out),
		`exit ${missing.status}`,
	);
}

function proveAboveFloor() {
	const missing = withTemp("pen-host4-missing-", () => {}, (dir) =>
		runNode(path.join(REPO_ROOT, "scripts/above-floor-api-allowlist.mjs"), [
			"--repo-root",
			dir,
		]),
	);
	record(
		"above-floor-api-allowlist missing file",
		missing.status !== 0 && /missing scripts\/above-floor-api-allowlist\.json/.test(missing.out),
		`exit ${missing.status}`,
	);

	// A bare string site used to be the failure case here. It is now VALID:
	// `sites` accepts a path or `{ path, reason }`. The old proof kept passing
	// on a technicality — the gate still exited non-zero, but for the stale-path
	// reason, not the one being proved — so it asserted a message that no longer
	// exists. What is enforced now is the per-site reason and path liveness.
	const writeAllowlist = (sites) => (dir) => {
		fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, "scripts/above-floor-api-allowlist.json"),
			JSON.stringify({
				apis: [
					{
						api: "Intl.Segmenter",
						fallback: "code-point",
						degradation: "whitespace words",
						sites,
					},
				],
			}),
		);
	};
	const withLiveSite = (sites) => (dir) => {
		writeAllowlist(sites)(dir);
		// the site must EXIST and contain the API, or the stale-path check fires
		// first and the proof measures the wrong thing.
		fs.mkdirSync(path.join(dir, "packages/core/src"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, "packages/core/src/bare.ts"),
			"const s = new Intl.Segmenter();\n",
		);
	};
	const runAllowlist = (dir) =>
		runNode(path.join(REPO_ROOT, "scripts/above-floor-api-allowlist.mjs"), [
			"--repo-root",
			dir,
		]);

	const noReason = withTemp(
		"pen-host4-noreason-",
		withLiveSite([{ path: "packages/core/src/bare.ts" }]),
		runAllowlist,
	);
	record(
		"above-floor-api-allowlist object site without reason",
		noReason.status !== 0 && /reason/i.test(noReason.out),
		`exit ${noReason.status}`,
	);

	const stale = withTemp(
		"pen-host4-stale-",
		writeAllowlist(["packages/core/src/deleted.ts"]),
		runAllowlist,
	);
	record(
		"above-floor-api-allowlist stale site path",
		stale.status !== 0 && /stale/i.test(stale.out),
		`exit ${stale.status}`,
	);

	// CAN IT PASS? A gate that only ever reports failure is as broken as one
	// that only ever reports success, and is harder to notice.
	const valid = withTemp(
		"pen-host4-valid-",
		withLiveSite(["packages/core/src/bare.ts"]),
		runAllowlist,
	);
	record(
		"above-floor-api-allowlist bare string site stays valid",
		valid.status === 0,
		`exit ${valid.status}`,
		"pass",
	);
}

function proveLintFormat() {
	const scope = runNode(path.join(REPO_ROOT, "scripts/lint-format.mjs"), [
		"--scope-only",
	]);
	record(
		"lint-format docs/config scope",
		scope.status === 0 && /docs\/config only/.test(scope.out),
		`exit ${scope.status}`,
	);
}

function proveBidi() {
	const missing = withTemp("pen-ri1-missing-", () => {}, (dir) =>
		runNode(path.join(REPO_ROOT, "scripts/no-bidi-override.mjs"), [
			"--repo-root",
			dir,
		]),
	);
	record(
		"no-bidi-override missing packages/rendering",
		missing.status !== 0 && /missing packages\/rendering/.test(missing.out),
		`exit ${missing.status}`,
	);
}

function proveTypesPurityClaim() {
	const writeTypesFixture = (helpers) => (dir) => {
		const typesDir = path.join(dir, "packages/types");
		fs.mkdirSync(path.join(typesDir, "src"), { recursive: true });
		fs.mkdirSync(path.join(typesDir, "dist"), { recursive: true });
		fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
		fs.writeFileSync(
			path.join(typesDir, "package.json"),
			JSON.stringify({ name: "@input/pen-types" }),
		);
		if (helpers != null) {
			fs.writeFileSync(path.join(typesDir, "src/helpers.ts"), helpers);
		}
		fs.writeFileSync(path.join(typesDir, "dist/index.d.ts"), "export {};\n");
		fs.writeFileSync(
			path.join(dir, "scripts/types-runtime-allowlist.json"),
			JSON.stringify({ entries: [] }),
		);
	};
	const runPurity = (dir) =>
		runNode(path.join(REPO_ROOT, "scripts/types-purity.mjs"), [
			"--repo-root",
			dir,
		]);

	const hole = withTemp(
		"pen-types-purity-hole-",
		writeTypesFixture(
			[
				"function helperA() {}",
				"function helperB() {}",
				"async function helperC() {}",
				"function helperD() {}",
			].join("\n"),
		),
		runPurity,
	);
	record(
		"types-purity four unexported helpers",
		hole.status !== 0 &&
			/helperA/.test(hole.out) &&
			/source-level runtime 0/.test(hole.out) &&
			!/\bOK:/.test(hole.out),
		`exit ${hole.status}`,
	);

	const empty = withTemp(
		"pen-types-purity-empty-",
		writeTypesFixture(null),
		runPurity,
	);
	record(
		"types-purity empty source walk",
		empty.status !== 0 && /cannot check/.test(empty.out),
		`exit ${empty.status}`,
	);
}

function main() {
	console.log("Wave P gate mutation proofs");
	console.log("");
	proveSizeLimit();
	proveInstallScripts();
	proveCatalog();
	proveAboveFloor();
	proveLintFormat();
	proveBidi();
	proveTypesPurityClaim();

	const failed = cases.filter((entry) => !entry.ok);
	console.log("");
	console.log(
		`mutation results: ${cases.length - failed.length}/${cases.length} failed correctly`,
	);
	if (failed.length > 0) {
		for (const entry of failed) {
			console.error(`  could not fail: ${entry.name}  ${entry.detail}`);
		}
		process.exitCode = 1;
	}
}

main();
