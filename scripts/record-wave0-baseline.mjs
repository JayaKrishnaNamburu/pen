#!/usr/bin/env node
/**
 * Distill a Playwright JSON-reporter document into the Wave 0
 * conformance baseline (GATE 0.8 / spec-v3/waves/wave-0-evidence.md).
 *
 * Does not invent numbers. A missing, unreadable, or non-Playwright
 * report is INCONCLUSIVE (exit 2). A measured run that is not a
 * baseline (unexpected, flaky, missing engine, empty suiteList) is
 * FAIL (exit 1) and writes nothing. PASS (exit 0) writes the file.
 *
 * --from-report is the coordinator path. --run-matrix launches the
 * three-engine suite and must not be used while another agent owns
 * the harness. --self-test is the red-proof.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const FIXTURE_DIR = path.join(
	SCRIPT_DIR,
	"__fixtures__",
	"record-wave0-baseline",
);

export const EXIT_PASS = 0;
export const EXIT_FAIL = 1;
export const EXIT_INCONCLUSIVE = 2;

export const ENGINE_NAMES = ["chromium", "webkit", "firefox"];
export const STATUSES = ["expected", "unexpected", "skipped", "flaky"];
export const SCHEMA_VERSION = 1;
export const BASELINE_SPEC = "spec-v3/waves/wave-0-evidence.md";
export const PRODUCER_GATE = "0.7";
/**
 * No `--` before the forwarded flags. pnpm 9 forwards extra args to the
 * script as-is, so a `--` survives into Playwright's argv, where it reads
 * as a test-file filter and matches nothing ("No tests found", exit 1) —
 * the matrix never starts and `--run-matrix` can only report INCONCLUSIVE.
 */
export const PRODUCER_COMMAND =
	"pnpm --filter @input/pen-conformance run test:matrix --reporter=json";
export const DEFAULT_OUTPUT_REL =
	"spec-v3/evidence/wave0-conformance-baseline.json";
export const CONFORMANCE_REL = "packages/tooling/conformance";
export const CONFIG_REL = `${CONFORMANCE_REL}/playwright.config.ts`;
export const CONFORMANCE_MANIFEST_REL = `${CONFORMANCE_REL}/package.json`;

export const FAIL_EMPTY_SUITE_LIST = "FAIL suiteList is empty";
export const FAIL_EMPTY_TEST_MATCH =
	"FAIL playwright.config.ts yielded 0 testMatch patterns";
export const FAIL_MISSING_SPEC_FILE = "FAIL spec is missing file";
export const FAIL_MUTEX =
	"FAIL --from-report and --run-matrix are mutually exclusive";
export const FAIL_NO_REPORTS =
	"FAIL no report given (pass --from-report) and --run-matrix was not set";
export const FAIL_SELF_TEST_FIXTURES =
	"FAIL self-test fixture directory matched 0 files";

export const INCONCLUSIVE_PLAYWRIGHT_VERSION =
	"cannot check: @playwright/test version is missing";
export const INCONCLUSIVE_CONFIG_ABSENT =
	"cannot check: playwright.config.ts is absent";
export const INCONCLUSIVE_MATRIX_NO_REPORT =
	"cannot check: test:matrix did not write a JSON report";

const MATRIX_TIMEOUT_MS = 900_000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const BASELINE_KEYS = [
	"schemaVersion",
	"recordedAt",
	"spec",
	"producer",
	"engines",
	"suiteList",
];
const PRODUCER_KEYS = ["gate", "command", "playwright", "testMatch"];
const ENGINE_KEYS = ["browserVersion", "stats"];

export const USAGE =
	"Usage: node scripts/record-wave0-baseline.mjs --from-report <path> [--from-report <path>...] [--force] [--output <path>] [--browser-version <engine>=<ver>] [--repo-root <dir>]\n" +
	"       node scripts/record-wave0-baseline.mjs --run-matrix [--force] [--output <path>]\n" +
	"       node scripts/record-wave0-baseline.mjs --self-test";

export function failUnexpected(engine, count) {
	return `FAIL unexpected > 0 on ${engine} (${count})`;
}

export function failFlaky(engine, count) {
	return `FAIL flaky > 0 on ${engine} (${count})`;
}

export function failMissingEngine(engine) {
	return `FAIL missing engine: ${engine}`;
}

export function failUnexpectedEngine(engine) {
	return `FAIL unexpected engine: ${engine}`;
}

export function failDuplicateEngine(engine) {
	return `FAIL engine ${engine} appears in multiple reports`;
}

export function failBaselineExists(rel) {
	return `FAIL baseline already exists: ${rel}`;
}

export function failUnknownStatus(status, engine) {
	return `FAIL unknown test status "${status}" on ${engine}`;
}

export function inconclusiveReportAbsent(reportPath) {
	return `cannot check: report is absent (${reportPath})`;
}

export function inconclusiveReportUnreadable(reportPath) {
	return `cannot check: report is not valid JSON (${reportPath})`;
}

export function inconclusiveNotPlaywright(reportPath) {
	return `cannot check: report is not a Playwright JSON reporter document (${reportPath})`;
}

export function inconclusiveBrowserVersion(engine) {
	return `cannot check: missing browserVersion for ${engine}`;
}

export function parseArgs(argv, repoRoot = DEFAULT_REPO_ROOT) {
	const args = {
		repoRoot,
		selfTest: false,
		force: false,
		runMatrix: false,
		fromReports: [],
		output: null,
		browserVersions: {},
	};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--self-test") {
			args.selfTest = true;
			continue;
		}
		if (arg === "--force") {
			args.force = true;
			continue;
		}
		if (arg === "--run-matrix") {
			args.runMatrix = true;
			continue;
		}
		if (arg === "--from-report") {
			const value = argv[i + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("missing value for --from-report");
			}
			args.fromReports.push(value);
			i += 1;
			continue;
		}
		if (arg === "--output") {
			const value = argv[i + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("missing value for --output");
			}
			args.output = value;
			i += 1;
			continue;
		}
		if (arg === "--browser-version") {
			const value = argv[i + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("missing value for --browser-version");
			}
			const eq = value.indexOf("=");
			if (eq <= 0 || eq === value.length - 1) {
				throw new Error(
					`--browser-version needs <engine>=<version>, got ${value}`,
				);
			}
			args.browserVersions[value.slice(0, eq)] = value.slice(eq + 1);
			i += 1;
			continue;
		}
		if (arg === "--repo-root") {
			const value = argv[i + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("missing value for --repo-root");
			}
			args.repoRoot = path.resolve(value);
			i += 1;
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			args.help = true;
			continue;
		}
		throw new Error(`unknown flag ${arg}`);
	}
	if (args.fromReports.length > 0 && args.runMatrix) {
		throw new Error(FAIL_MUTEX);
	}
	if (args.output == null) {
		args.output = path.join(args.repoRoot, DEFAULT_OUTPUT_REL);
	} else if (!path.isAbsolute(args.output)) {
		args.output = path.resolve(args.output);
	}
	args.fromReports = args.fromReports.map((entry) =>
		path.isAbsolute(entry) ? entry : path.resolve(entry),
	);
	return args;
}

export function formatOutcome({ outcome, reason, details = [] }) {
	const headline =
		reason.startsWith(`${outcome}:`) || reason.startsWith(`${outcome} `)
			? reason
			: `${outcome}: ${reason}`;
	const lines = [headline];
	for (const detail of details) {
		lines.push(`  ${detail}`);
	}
	return lines.join("\n");
}

function pass(reason, extra = {}) {
	return { outcome: "PASS", exitCode: EXIT_PASS, reason, ...extra };
}

function fail(reason, extra = {}) {
	return { outcome: "FAIL", exitCode: EXIT_FAIL, reason, ...extra };
}

function inconclusive(reason, extra = {}) {
	return {
		outcome: "INCONCLUSIVE",
		exitCode: EXIT_INCONCLUSIVE,
		reason,
		...extra,
	};
}

export function parseTestMatchFromConfig(text) {
	if (typeof text !== "string" || text.length === 0) {
		return [];
	}
	const match = text.match(/testMatch:\s*\[([\s\S]*?)\]/);
	if (!match) {
		return [];
	}
	const patterns = [];
	for (const quoted of match[1].matchAll(/["']([^"']+)["']/g)) {
		patterns.push(quoted[1]);
	}
	return patterns;
}

export function collectSpecs(suites) {
	const specs = [];
	function walk(nodes) {
		if (!Array.isArray(nodes)) {
			return;
		}
		for (const suite of nodes) {
			if (Array.isArray(suite?.specs)) {
				specs.push(...suite.specs);
			}
			walk(suite?.suites);
		}
	}
	walk(suites);
	return specs;
}

export function specPathRelativeToConformance(specFile, rootDir) {
	if (typeof specFile !== "string" || specFile.length === 0) {
		return "";
	}
	const posix = specFile.split(path.sep).join("/");
	const root = (rootDir ?? "").split(path.sep).join("/").replace(/\/$/, "");
	if (root && (posix === root || posix.startsWith(`${root}/`))) {
		return posix.slice(root.length + (posix === root ? 0 : 1));
	}
	const marker = `${CONFORMANCE_REL}/`;
	const idx = posix.indexOf(marker);
	if (idx !== -1) {
		return posix.slice(idx + marker.length);
	}
	return posix.replace(/^\.\//, "");
}

export function emptyEngineStats() {
	return { expected: 0, unexpected: 0, skipped: 0, flaky: 0 };
}

export function bundledBrowserVersions(browsersJson) {
	const out = {};
	const browsers = browsersJson?.browsers;
	if (!Array.isArray(browsers) || browsers.length === 0) {
		return out;
	}
	for (const browser of browsers) {
		if (!ENGINE_NAMES.includes(browser.name)) {
			continue;
		}
		if (
			typeof browser.browserVersion === "string" &&
			browser.browserVersion.length > 0
		) {
			out[browser.name] = browser.browserVersion;
		}
	}
	return out;
}

export function readPlaywrightVersion(repoRoot) {
	const manifestPath = path.join(repoRoot, CONFORMANCE_MANIFEST_REL);
	let manifest;
	try {
		manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
	} catch {
		return null;
	}
	try {
		const fromManifest = createRequire(manifestPath);
		const installedPath = fromManifest.resolve(
			"@playwright/test/package.json",
		);
		const installed = JSON.parse(fs.readFileSync(installedPath, "utf8"));
		if (
			typeof installed.version === "string" &&
			installed.version.length > 0
		) {
			return installed.version;
		}
	} catch {
		// fall through to the declared range
	}
	const declared =
		manifest.devDependencies?.["@playwright/test"] ??
		manifest.dependencies?.["@playwright/test"];
	return typeof declared === "string" && declared.length > 0
		? declared
		: null;
}

export function readBundledBrowserVersions(repoRoot) {
	try {
		const fromConformance = createRequire(
			path.join(repoRoot, CONFORMANCE_MANIFEST_REL),
		);
		const playwrightTest = fromConformance.resolve(
			"@playwright/test/package.json",
		);
		const fromTest = createRequire(playwrightTest);
		const playwrightPkg = fromTest.resolve("playwright/package.json");
		const fromPlaywright = createRequire(playwrightPkg);
		const corePkg = fromPlaywright.resolve("playwright-core/package.json");
		const browsersPath = path.join(path.dirname(corePkg), "browsers.json");
		return bundledBrowserVersions(
			JSON.parse(fs.readFileSync(browsersPath, "utf8")),
		);
	} catch {
		return {};
	}
}

export function loadJsonReport(reportPath) {
	if (!fs.existsSync(reportPath)) {
		return inconclusive(inconclusiveReportAbsent(reportPath));
	}
	let raw;
	try {
		raw = fs.readFileSync(reportPath, "utf8");
	} catch (error) {
		return inconclusive(
			`cannot check: report is unreadable (${reportPath})`,
			{
				details: [
					error instanceof Error ? error.message : String(error),
				],
			},
		);
	}
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return inconclusive(inconclusiveReportUnreadable(reportPath));
	}
	if (
		parsed == null ||
		typeof parsed !== "object" ||
		Array.isArray(parsed) ||
		!Array.isArray(parsed.suites)
	) {
		return inconclusive(inconclusiveNotPlaywright(reportPath));
	}
	return { ok: true, report: parsed, path: reportPath };
}

function projectBrowserVersion(report, engine) {
	const projects = report.config?.projects;
	if (!Array.isArray(projects)) {
		return null;
	}
	for (const project of projects) {
		if (project?.name !== engine) {
			continue;
		}
		const version = project.metadata?.browserVersion;
		if (typeof version === "string" && version.length > 0) {
			return version;
		}
	}
	return null;
}

export function distillReports({
	reports,
	repoRoot,
	browserVersions = {},
	bundledVersions = null,
	testMatch = null,
	playwrightVersion = null,
	recordedAt = null,
} = {}) {
	if (!Array.isArray(reports) || reports.length === 0) {
		return fail(FAIL_NO_REPORTS);
	}

	const statsByEngine = new Map();
	const engineOwner = new Map();
	const suiteSet = new Set();
	const extraEngines = new Set();

	for (const { report, path: reportPath } of reports) {
		const specs = collectSpecs(report.suites);
		const rootDir = report.config?.rootDir;
		for (const spec of specs) {
			const rel = specPathRelativeToConformance(spec.file, rootDir);
			if (rel.length === 0) {
				return fail(FAIL_MISSING_SPEC_FILE, {
					details: [reportPath ?? ""],
				});
			}
			suiteSet.add(rel);
			const tests = Array.isArray(spec.tests) ? spec.tests : [];
			for (const test of tests) {
				const engine = test.projectName;
				if (typeof engine !== "string" || engine.length === 0) {
					return fail(FAIL_MISSING_SPEC_FILE, {
						details: ["test is missing projectName"],
					});
				}
				if (!ENGINE_NAMES.includes(engine)) {
					extraEngines.add(engine);
					continue;
				}
				if (!statsByEngine.has(engine)) {
					statsByEngine.set(engine, emptyEngineStats());
					engineOwner.set(engine, reportPath);
				} else if (
					reports.length > 1 &&
					engineOwner.get(engine) !== reportPath
				) {
					return fail(failDuplicateEngine(engine));
				}
				const stats = statsByEngine.get(engine);
				const status = test.status;
				if (!STATUSES.includes(status)) {
					return fail(failUnknownStatus(status, engine));
				}
				stats[status] += 1;
			}
		}
	}

	if (extraEngines.size > 0) {
		const [engine] = [...extraEngines].sort();
		return fail(failUnexpectedEngine(engine));
	}

	const suiteList = [...suiteSet].sort();
	if (suiteList.length === 0) {
		return fail(FAIL_EMPTY_SUITE_LIST);
	}

	for (const engine of ENGINE_NAMES) {
		if (!statsByEngine.has(engine)) {
			return fail(failMissingEngine(engine));
		}
	}

	for (const engine of ENGINE_NAMES) {
		const stats = statsByEngine.get(engine);
		if (stats.unexpected > 0) {
			return fail(failUnexpected(engine, stats.unexpected));
		}
		if (stats.flaky > 0) {
			return fail(failFlaky(engine, stats.flaky));
		}
	}

	const resolvedMatch = Array.isArray(testMatch)
		? { error: null, patterns: testMatch }
		: readTestMatch(repoRoot);
	if (resolvedMatch.error) {
		return resolvedMatch.error;
	}
	if (resolvedMatch.patterns.length === 0) {
		return fail(FAIL_EMPTY_TEST_MATCH);
	}

	const version = playwrightVersion ?? readPlaywrightVersion(repoRoot);
	if (version == null) {
		return inconclusive(INCONCLUSIVE_PLAYWRIGHT_VERSION);
	}

	const bundled =
		bundledVersions ??
		(bundledVersions === null ? readBundledBrowserVersions(repoRoot) : {});
	const engines = {};
	for (const engine of ENGINE_NAMES) {
		let browserVersion = null;
		for (const { report } of reports) {
			browserVersion = projectBrowserVersion(report, engine);
			if (browserVersion) {
				break;
			}
		}
		if (browserVersion == null && browserVersions[engine]) {
			browserVersion = browserVersions[engine];
		}
		if (browserVersion == null && bundled[engine]) {
			browserVersion = bundled[engine];
		}
		if (browserVersion == null) {
			return inconclusive(inconclusiveBrowserVersion(engine));
		}
		const stats = statsByEngine.get(engine);
		engines[engine] = {
			browserVersion,
			stats: {
				expected: stats.expected,
				unexpected: stats.unexpected,
				skipped: stats.skipped,
				flaky: stats.flaky,
			},
		};
	}

	const baseline = {
		schemaVersion: SCHEMA_VERSION,
		recordedAt: recordedAt ?? new Date().toISOString(),
		spec: BASELINE_SPEC,
		producer: {
			gate: PRODUCER_GATE,
			command: PRODUCER_COMMAND,
			playwright: version,
			testMatch: resolvedMatch.patterns,
		},
		engines,
		suiteList,
	};
	return pass("recorded three-engine conformance baseline", { baseline });
}

function readTestMatch(repoRoot) {
	const configPath = path.join(repoRoot, CONFIG_REL);
	if (!fs.existsSync(configPath)) {
		return {
			error: inconclusive(INCONCLUSIVE_CONFIG_ABSENT),
			patterns: [],
		};
	}
	const text = fs.readFileSync(configPath, "utf8");
	return { error: null, patterns: parseTestMatchFromConfig(text) };
}

export function recordBaseline(args) {
	const outputRel = posixRel(args.repoRoot, args.output);
	if (fs.existsSync(args.output) && !args.force) {
		return fail(failBaselineExists(outputRel));
	}

	let reports;
	if (args.runMatrix) {
		const ran = runMatrixAndLoad(args);
		if (ran.outcome) {
			return ran;
		}
		reports = ran.reports;
	} else if (args.fromReports.length > 0) {
		reports = [];
		for (const reportPath of args.fromReports) {
			const loaded = loadJsonReport(reportPath);
			if (!loaded.ok) {
				return loaded;
			}
			reports.push(loaded);
		}
	} else {
		return fail(FAIL_NO_REPORTS);
	}

	const distilled = distillReports({
		reports,
		repoRoot: args.repoRoot,
		browserVersions: args.browserVersions,
	});
	if (distilled.outcome !== "PASS") {
		return distilled;
	}

	try {
		fs.mkdirSync(path.dirname(args.output), { recursive: true });
		const tmp = `${args.output}.tmp`;
		fs.writeFileSync(
			tmp,
			`${JSON.stringify(distilled.baseline, null, "\t")}\n`,
		);
		fs.renameSync(tmp, args.output);
	} catch (error) {
		return inconclusive(`cannot check: failed to write ${outputRel}`, {
			details: [error instanceof Error ? error.message : String(error)],
		});
	}

	return pass(`wrote ${outputRel}`, {
		baseline: distilled.baseline,
		output: args.output,
	});
}

function runMatrixAndLoad(args) {
	const reportPath =
		process.env.PLAYWRIGHT_JSON_OUTPUT_FILE &&
		process.env.PLAYWRIGHT_JSON_OUTPUT_FILE.length > 0
			? path.resolve(process.env.PLAYWRIGHT_JSON_OUTPUT_FILE)
			: path.join(
					os.tmpdir(),
					`wave0-conformance-raw-${process.pid}.json`,
				);
	const result = spawnSync(
		"pnpm",
		[
			"--filter",
			"@input/pen-conformance",
			"run",
			"test:matrix",
			"--reporter=json",
		],
		{
			cwd: args.repoRoot,
			env: {
				...process.env,
				PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
			},
			timeout: MATRIX_TIMEOUT_MS,
			stdio: ["ignore", "inherit", "inherit"],
		},
	);
	if (!fs.existsSync(reportPath)) {
		return inconclusive(INCONCLUSIVE_MATRIX_NO_REPORT, {
			details: [
				result.error?.message ?? `test:matrix exited ${result.status}`,
			],
		});
	}
	const loaded = loadJsonReport(reportPath);
	if (!loaded.ok) {
		return loaded;
	}
	return { reports: [loaded] };
}

function posixRel(repoRoot, filePath) {
	const rel = path.relative(repoRoot, filePath);
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		return filePath.split(path.sep).join("/");
	}
	return rel.split(path.sep).join("/");
}

export function assertBaselineShape(baseline) {
	if (baseline == null || typeof baseline !== "object") {
		return "baseline is not an object";
	}
	const keys = Object.keys(baseline);
	if (keys.join(",") !== BASELINE_KEYS.join(",")) {
		return `baseline keys ${keys.join(",")} !== ${BASELINE_KEYS.join(",")}`;
	}
	if (baseline.schemaVersion !== SCHEMA_VERSION) {
		return `schemaVersion ${baseline.schemaVersion}`;
	}
	if (
		typeof baseline.recordedAt !== "string" ||
		!ISO_RE.test(baseline.recordedAt)
	) {
		return `recordedAt is not ISO-8601 (${baseline.recordedAt})`;
	}
	if (baseline.spec !== BASELINE_SPEC) {
		return `spec ${baseline.spec}`;
	}
	const producerKeys = Object.keys(baseline.producer ?? {});
	if (producerKeys.join(",") !== PRODUCER_KEYS.join(",")) {
		return `producer keys ${producerKeys.join(",")}`;
	}
	if (baseline.producer.gate !== PRODUCER_GATE) {
		return `producer.gate ${baseline.producer.gate}`;
	}
	if (baseline.producer.command !== PRODUCER_COMMAND) {
		return `producer.command ${baseline.producer.command}`;
	}
	if (
		typeof baseline.producer.playwright !== "string" ||
		baseline.producer.playwright.length === 0
	) {
		return "producer.playwright is empty";
	}
	if (
		!Array.isArray(baseline.producer.testMatch) ||
		baseline.producer.testMatch.length === 0
	) {
		return "producer.testMatch is empty";
	}
	const engineKeys = Object.keys(baseline.engines ?? {});
	if (engineKeys.join(",") !== ENGINE_NAMES.join(",")) {
		return `engines keys ${engineKeys.join(",")}`;
	}
	for (const engine of ENGINE_NAMES) {
		const entry = baseline.engines[engine];
		if (Object.keys(entry).join(",") !== ENGINE_KEYS.join(",")) {
			return `${engine} keys`;
		}
		if (
			typeof entry.browserVersion !== "string" ||
			entry.browserVersion.length === 0
		) {
			return `${engine} browserVersion is empty`;
		}
		for (const status of STATUSES) {
			if (
				typeof entry.stats[status] !== "number" ||
				!Number.isInteger(entry.stats[status]) ||
				entry.stats[status] < 0
			) {
				return `${engine} stats.${status}`;
			}
		}
		if (entry.stats.unexpected !== 0) {
			return `${engine} unexpected is not 0`;
		}
		if (entry.stats.flaky !== 0) {
			return `${engine} flaky is not 0`;
		}
	}
	if (!Array.isArray(baseline.suiteList) || baseline.suiteList.length === 0) {
		return "suiteList is empty";
	}
	const sorted = [...baseline.suiteList].sort();
	if (sorted.join("\0") !== baseline.suiteList.join("\0")) {
		return "suiteList is not sorted";
	}
	if (new Set(baseline.suiteList).size !== baseline.suiteList.length) {
		return "suiteList is not unique";
	}
	return null;
}

function fixturePath(name) {
	return path.join(FIXTURE_DIR, name);
}

function loadFixture(name) {
	return loadJsonReport(fixturePath(name));
}

function cloneJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

export function runSelfTests(repoRoot = DEFAULT_REPO_ROOT) {
	const fixtureNames = fs.existsSync(FIXTURE_DIR)
		? fs.readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(".json"))
		: [];
	assert(fixtureNames.length > 0, FAIL_SELF_TEST_FIXTURES);

	const cleanLoaded = loadFixture("clean-three-engine.json");
	assert(
		cleanLoaded.ok,
		`self-test: clean fixture must load: ${cleanLoaded.reason}`,
	);
	const clean = distillReports({
		reports: [cleanLoaded],
		repoRoot,
		recordedAt: "2026-08-24T18:00:00.000Z",
	});
	assert(
		clean.outcome === "PASS",
		`self-test: clean fixture must pass: ${clean.reason}`,
	);
	const shapeError = assertBaselineShape(clean.baseline);
	assert(shapeError == null, `self-test: clean shape: ${shapeError}`);
	assert(
		clean.baseline.suiteList.join(",") ===
			"scenarios/harness-self-test.spec.ts,scenarios/hello-world.spec.ts",
		`self-test: suiteList, got ${clean.baseline.suiteList.join(",")}`,
	);
	assert(
		clean.baseline.engines.firefox.stats.skipped === 1,
		"self-test: firefox skip must stay in suiteList and increment skipped",
	);
	assert(
		clean.baseline.engines.firefox.stats.expected === 1,
		"self-test: firefox expected must be measured, not invented as 0",
	);
	assert(
		clean.baseline.engines.chromium.browserVersion === "145.0.7632.6",
		"self-test: chromium browserVersion from report metadata",
	);
	assert(
		clean.baseline.producer.testMatch.join(",") ===
			"scenarios/**/*.spec.ts,suites/**/*.spec.ts",
		`self-test: testMatch, got ${clean.baseline.producer.testMatch.join(",")}`,
	);

	const scratch = fs.mkdtempSync(
		path.join(os.tmpdir(), "pen-record-wave0-baseline-"),
	);
	const cleanOut = path.join(scratch, "wave0-conformance-baseline.json");
	const written = recordBaseline({
		repoRoot,
		fromReports: [fixturePath("clean-three-engine.json")],
		output: cleanOut,
		force: false,
		runMatrix: false,
		browserVersions: {},
	});
	assert(
		written.outcome === "PASS",
		`self-test: write clean: ${written.reason}`,
	);
	assert(
		fs.existsSync(cleanOut),
		"self-test: clean write must create the file",
	);
	const refuseOverwrite = recordBaseline({
		repoRoot,
		fromReports: [fixturePath("clean-three-engine.json")],
		output: cleanOut,
		force: false,
		runMatrix: false,
		browserVersions: {},
	});
	assert(
		refuseOverwrite.outcome === "FAIL",
		"self-test: existing baseline without --force must fail",
	);
	assert(
		refuseOverwrite.reason ===
			failBaselineExists(posixRel(repoRoot, cleanOut)),
		`self-test: overwrite reason, got ${refuseOverwrite.reason}`,
	);

	const unexpectedLoaded = loadFixture("unexpected.json");
	assert(unexpectedLoaded.ok, "self-test: unexpected fixture must load");
	const unexpected = distillReports({
		reports: [unexpectedLoaded],
		repoRoot,
	});
	assert(
		unexpected.outcome === "FAIL",
		"self-test: unexpected fixture must fail",
	);
	assert(
		unexpected.reason === failUnexpected("chromium", 1),
		`self-test: unexpected reason, got ${unexpected.reason}`,
	);
	const unexpectedOut = path.join(scratch, "from-unexpected.json");
	const unexpectedWrite = recordBaseline({
		repoRoot,
		fromReports: [fixturePath("unexpected.json")],
		output: unexpectedOut,
		force: false,
		runMatrix: false,
		browserVersions: {},
	});
	assert(
		unexpectedWrite.outcome === "FAIL" && !fs.existsSync(unexpectedOut),
		"self-test: unexpected must not write a file",
	);

	const flakyLoaded = loadFixture("flaky.json");
	assert(flakyLoaded.ok, "self-test: flaky fixture must load");
	const flaky = distillReports({
		reports: [flakyLoaded],
		repoRoot,
	});
	assert(flaky.outcome === "FAIL", "self-test: flaky fixture must fail");
	assert(
		flaky.reason === failFlaky("webkit", 1),
		`self-test: flaky reason, got ${flaky.reason}`,
	);
	const flakyOut = path.join(scratch, "from-flaky.json");
	const flakyWrite = recordBaseline({
		repoRoot,
		fromReports: [fixturePath("flaky.json")],
		output: flakyOut,
		force: false,
		runMatrix: false,
		browserVersions: {},
	});
	assert(
		flakyWrite.outcome === "FAIL" && !fs.existsSync(flakyOut),
		"self-test: flaky must not write a file",
	);

	const missingPath = path.join(scratch, "missing-report.json");
	const missing = loadJsonReport(missingPath);
	assert(
		missing.outcome === "INCONCLUSIVE",
		"self-test: missing report must be INCONCLUSIVE",
	);
	assert(
		missing.reason === inconclusiveReportAbsent(missingPath),
		`self-test: missing reason, got ${missing.reason}`,
	);
	assert(missing.exitCode === EXIT_INCONCLUSIVE, "self-test: missing exit 2");
	const missingWrite = recordBaseline({
		repoRoot,
		fromReports: [missingPath],
		output: path.join(scratch, "from-missing.json"),
		force: false,
		runMatrix: false,
		browserVersions: {},
	});
	assert(
		missingWrite.outcome === "INCONCLUSIVE" &&
			!fs.existsSync(path.join(scratch, "from-missing.json")),
		"self-test: missing report must not write a file",
	);

	const invalid = loadJsonReport(fixturePath("invalid.json"));
	assert(
		invalid.outcome === "INCONCLUSIVE",
		"self-test: invalid JSON must be INCONCLUSIVE",
	);
	assert(
		invalid.reason ===
			inconclusiveReportUnreadable(fixturePath("invalid.json")),
		`self-test: invalid reason, got ${invalid.reason}`,
	);

	const empty = distillReports({
		reports: [loadFixture("empty-suites.json")],
		repoRoot,
	});
	assert(empty.outcome === "FAIL", "self-test: empty suites must fail");
	assert(
		empty.reason === FAIL_EMPTY_SUITE_LIST,
		`self-test: empty reason, got ${empty.reason}`,
	);

	const chromiumOnly = distillReports({
		reports: [loadFixture("chromium-only.json")],
		repoRoot,
	});
	assert(
		chromiumOnly.outcome === "FAIL",
		"self-test: chromium-only must fail",
	);
	assert(
		chromiumOnly.reason === failMissingEngine("webkit"),
		`self-test: chromium-only reason, got ${chromiumOnly.reason}`,
	);

	const brokenUnexpected = cloneJson(cleanLoaded.report);
	brokenUnexpected.suites[0].specs[0].tests[0].status = "unexpected";
	const brokenUnexpectedResult = distillReports({
		reports: [{ report: brokenUnexpected, path: "mutated-unexpected" }],
		repoRoot,
	});
	assert(
		brokenUnexpectedResult.reason === failUnexpected("chromium", 1),
		`self-test: break unexpected, got ${brokenUnexpectedResult.reason}`,
	);

	const brokenFlaky = cloneJson(cleanLoaded.report);
	brokenFlaky.suites[0].specs[0].tests[1].status = "flaky";
	const brokenFlakyResult = distillReports({
		reports: [{ report: brokenFlaky, path: "mutated-flaky" }],
		repoRoot,
	});
	assert(
		brokenFlakyResult.reason === failFlaky("webkit", 1),
		`self-test: break flaky, got ${brokenFlakyResult.reason}`,
	);

	const brokenEmpty = cloneJson(cleanLoaded.report);
	brokenEmpty.suites = [];
	const brokenEmptyResult = distillReports({
		reports: [{ report: brokenEmpty, path: "mutated-empty" }],
		repoRoot,
	});
	assert(
		brokenEmptyResult.reason === FAIL_EMPTY_SUITE_LIST,
		`self-test: break empty suiteList, got ${brokenEmptyResult.reason}`,
	);

	const brokenEngine = cloneJson(cleanLoaded.report);
	for (const spec of collectSpecs(brokenEngine.suites)) {
		spec.tests = spec.tests.filter(
			(test) => test.projectName !== "firefox",
		);
	}
	const brokenEngineResult = distillReports({
		reports: [{ report: brokenEngine, path: "mutated-engine" }],
		repoRoot,
	});
	assert(
		brokenEngineResult.reason === failMissingEngine("firefox"),
		`self-test: break missing engine, got ${brokenEngineResult.reason}`,
	);

	const brokenBrowser = cloneJson(cleanLoaded.report);
	for (const project of brokenBrowser.config.projects) {
		project.metadata = {};
	}
	const brokenBrowserResult = distillReports({
		reports: [{ report: brokenBrowser, path: "mutated-browser" }],
		repoRoot,
		browserVersions: {},
		bundledVersions: {},
	});
	assert(
		brokenBrowserResult.outcome === "INCONCLUSIVE",
		"self-test: missing browserVersion must be INCONCLUSIVE",
	);
	assert(
		brokenBrowserResult.reason === inconclusiveBrowserVersion("chromium"),
		`self-test: break browserVersion, got ${brokenBrowserResult.reason}`,
	);

	const brokenMatch = distillReports({
		reports: [cleanLoaded],
		repoRoot,
		testMatch: [],
	});
	assert(
		brokenMatch.reason === FAIL_EMPTY_TEST_MATCH,
		`self-test: break empty testMatch, got ${brokenMatch.reason}`,
	);

	const duplicate = distillReports({
		reports: [
			{ report: cleanLoaded.report, path: "report-a" },
			{ report: cleanLoaded.report, path: "report-b" },
		],
		repoRoot,
	});
	assert(
		duplicate.reason === failDuplicateEngine("chromium"),
		`self-test: break duplicate engine, got ${duplicate.reason}`,
	);

	try {
		parseArgs(["--from-report", "a.json", "--run-matrix"]);
		throw new Error("self-test: mutex must throw");
	} catch (error) {
		assert(
			error instanceof Error && error.message === FAIL_MUTEX,
			`self-test: mutex, got ${error instanceof Error ? error.message : error}`,
		);
	}

	fs.rmSync(scratch, { recursive: true, force: true });

	return {
		clean: clean.baseline,
		unexpected: unexpected.reason,
		flaky: flaky.reason,
		missing: missing.reason,
		invalid: invalid.reason,
		empty: empty.reason,
		chromiumOnly: chromiumOnly.reason,
		overwrite: refuseOverwrite.reason,
		brokenUnexpected: brokenUnexpectedResult.reason,
		brokenFlaky: brokenFlakyResult.reason,
		brokenEmpty: brokenEmptyResult.reason,
		brokenEngine: brokenEngineResult.reason,
		brokenBrowser: brokenBrowserResult.reason,
		brokenMatch: brokenMatch.reason,
		duplicate: duplicate.reason,
	};
}

function main() {
	let args;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		console.error(USAGE);
		process.exitCode = EXIT_FAIL;
		return;
	}

	if (args.help) {
		console.log(USAGE);
		return;
	}

	if (args.selfTest) {
		const printed = runSelfTests(args.repoRoot);
		console.log("self-test clean three-engine → PASS");
		console.log(`  suiteList ${printed.clean.suiteList.join(" ")}`);
		console.log("");
		console.log("self-test unexpected fixture:");
		console.log(printed.unexpected);
		console.log("");
		console.log("self-test flaky fixture:");
		console.log(printed.flaky);
		console.log("");
		console.log("self-test missing report:");
		console.log(printed.missing);
		console.log("");
		console.log("self-test unreadable report:");
		console.log(printed.invalid);
		console.log("");
		console.log("self-test empty suiteList:");
		console.log(printed.empty);
		console.log("");
		console.log("self-test chromium-only:");
		console.log(printed.chromiumOnly);
		console.log("");
		console.log("self-test overwrite without --force:");
		console.log(printed.overwrite);
		console.log("");
		console.log("self-test break-on-purpose:");
		console.log(`  ${printed.brokenUnexpected}`);
		console.log(`  ${printed.brokenFlaky}`);
		console.log(`  ${printed.brokenEmpty}`);
		console.log(`  ${printed.brokenEngine}`);
		console.log(`  ${printed.brokenBrowser}`);
		console.log(`  ${printed.brokenMatch}`);
		console.log(`  ${printed.duplicate}`);
		console.log("");
		console.log(
			"record-wave0-baseline self-test ok (clean three-engine records; unexpected, flaky, empty suiteList, and missing engine fail by name; missing/unreadable report is INCONCLUSIVE; no file written on refuse)",
		);
		return;
	}

	const result = recordBaseline(args);
	console.log(
		formatOutcome({
			outcome: result.outcome,
			reason: result.reason,
			details: result.details ?? [],
		}),
	);
	process.exitCode = result.exitCode;
}

const isDirectRun =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
	main();
}
