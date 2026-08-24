#!/usr/bin/env node
/**
 * Wave 0 gate runner. Parses `- GATE` lines from spec-v3/waves/*.md,
 * prints the population, and executes what can be checked. An absent
 * spec-v3 tree or a wave file with zero gates is a failure — never a
 * pass over an empty set.
 *
 * `--scope-lint` classifies without executing and fails when a command
 * is structurally unable to fail: vitest `-t` / Node `--test-name-pattern`
 * matching nothing exits 0; a path glob matching zero files is an empty
 * population. This is separate from `cannot-run` so existing waves stay
 * parseable while their owners rewrite the commands.
 */

import { spawnSync } from "node:child_process";
import fs, { globSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const GATE_LINE_RE = /^- GATE (\d+\.\d+) \[(\w+)\]:\s*(.+)$/;
const EXPECT_LINE_RE = /^\s+expect:\s+(.+)$/;
const EXIT_EXPECT_RE = /\bexit\s+(\d+)\b/;
const WAVE_FILE_RE = /^wave-.*\.md$/i;

export const CANNOT_CHECK_ABSENT = "cannot check: spec-v3/waves is absent";
export const CANNOT_CHECK_EMPTY_DIR = "cannot check: wave directory matched 0 files";
export const CANNOT_CHECK_ZERO_GATES = "cannot check: wave file yielded 0 gates";

export function parseArgs(argv, repoRoot = DEFAULT_REPO_ROOT) {
	const files = [];
	let wavesDir = path.join(repoRoot, "spec-v3", "waves");
	let preflight = false;
	let selfTest = false;
	let scopeLint = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--preflight") {
			preflight = true;
			continue;
		}
		if (arg === "--self-test") {
			selfTest = true;
			continue;
		}
		if (arg === "--scope-lint") {
			scopeLint = true;
			continue;
		}
		if (arg === "--waves-dir") {
			const value = argv[i + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("missing value for --waves-dir");
			}
			wavesDir = path.resolve(repoRoot, value);
			i += 1;
			continue;
		}
		if (arg === "--count" || arg === "--migration-cross-check") {
			throw new Error(`unsupported flag ${arg} (not implemented)`);
		}
		if (arg.startsWith("--")) {
			throw new Error(`unknown flag ${arg}`);
		}
		files.push(path.resolve(repoRoot, arg));
	}
	return { files, wavesDir, preflight, selfTest, scopeLint, repoRoot };
}

export function collectWaveFiles(wavesDir, explicitFiles = []) {
	if (explicitFiles.length > 0) {
		return { error: null, files: explicitFiles };
	}
	if (!fs.existsSync(wavesDir)) {
		return { error: CANNOT_CHECK_ABSENT, files: [] };
	}
	const stat = fs.statSync(wavesDir);
	if (!stat.isDirectory()) {
		return { error: CANNOT_CHECK_ABSENT, files: [] };
	}
	const files = fs
		.readdirSync(wavesDir)
		.filter((name) => WAVE_FILE_RE.test(name))
		.map((name) => path.join(wavesDir, name))
		.sort();
	if (files.length === 0) {
		return { error: CANNOT_CHECK_EMPTY_DIR, files: [] };
	}
	return { error: null, files };
}

export function parseWaveFile(filePath) {
	const text = fs.readFileSync(filePath, "utf8");
	const lines = text.split(/\r?\n/);
	const gates = [];
	for (let i = 0; i < lines.length; i += 1) {
		const match = lines[i].match(GATE_LINE_RE);
		if (!match) {
			continue;
		}
		const command = extractCommand(match[3] ?? "");
		let expect = "";
		for (let j = i + 1; j < lines.length; j += 1) {
			if (lines[j].trim() === "") {
				continue;
			}
			const expectMatch = lines[j].match(EXPECT_LINE_RE);
			if (expectMatch) {
				expect = expectMatch[1].trim();
			}
			break;
		}
		gates.push({
			id: match[1],
			kind: match[2],
			command,
			expect,
			file: filePath,
			line: i + 1,
		});
	}
	return gates;
}

export function extractCommand(rest) {
	const trimmed = rest.trim();
	const tick = trimmed.match(/^`([^`]+)`/);
	if (tick) {
		return tick[1].trim();
	}
	return trimmed.replace(/\s+\(.*\)\s*$/, "").trim();
}

export function expectedExit(expect) {
	const match = expect.match(EXIT_EXPECT_RE);
	if (match) {
		return Number(match[1]);
	}
	if (/\bno matches\b/i.test(expect)) {
		return 1;
	}
	return 0;
}

export function looksLikeShell(command) {
	if (!command) {
		return false;
	}
	if (/^(hostile corpus|undo granularity|profile parity|codemod fixture|lint red-proof|one-time agreement)\b/i.test(command)) {
		return false;
	}
	return /^(pnpm|node|rg|test|true|false|ls|for|git|npm)\b/.test(command);
}

export function loadWorkspacePackages(repoRoot) {
	const packages = new Map();
	const packagesRoot = path.join(repoRoot, "packages");
	if (!fs.existsSync(packagesRoot)) {
		return packages;
	}
	function visit(dir, depth) {
		if (depth > 3) {
			return;
		}
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		const manifest = path.join(dir, "package.json");
		if (fs.existsSync(manifest)) {
			try {
				const parsed = JSON.parse(fs.readFileSync(manifest, "utf8"));
				if (parsed.name) {
					packages.set(parsed.name, parsed);
				}
			} catch {
				// skip unreadable manifests
			}
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}
			if (
				entry.name === "node_modules" ||
				entry.name === "dist" ||
				entry.name === ".git"
			) {
				continue;
			}
			visit(path.join(dir, entry.name), depth + 1);
		}
	}
	visit(packagesRoot, 0);
	return packages;
}

export function classifyGate(gate, repoRoot, packages) {
	const command = gate.command;
	if (!looksLikeShell(command)) {
		return {
			status: "cannot-run",
			reason: "command is prose, not a shell command",
		};
	}

	const nodeScript = command.match(/\bnode\s+((?:scripts\/)?\S+\.mjs)\b/);
	if (nodeScript) {
		const rel = nodeScript[1];
		const abs = path.resolve(repoRoot, rel);
		if (!fs.existsSync(abs)) {
			return {
				status: "cannot-run",
				reason: `missing ${rel}`,
			};
		}
	}

	if (/\bspec-v3-gates\.mjs\s+--count\b/.test(command) || /\bv3-gates\.mjs\s+--count\b/.test(command)) {
		return {
			status: "cannot-run",
			reason: "runner has no --count flag",
		};
	}
	if (command.includes("--migration-cross-check")) {
		return {
			status: "cannot-run",
			reason: "runner has no --migration-cross-check flag",
		};
	}

	const filterRun = command.match(
		/pnpm --filter (\S+) run (\S+)/,
	);
	if (filterRun) {
		const pkg = packages.get(filterRun[1]);
		if (!pkg) {
			return {
				status: "cannot-run",
				reason: `workspace has no package ${filterRun[1]}`,
			};
		}
		const scriptName = filterRun[2];
		if (!pkg.scripts?.[scriptName]) {
			return {
				status: "cannot-run",
				reason: `${filterRun[1]} has no script "${scriptName}"`,
			};
		}
	}

	const filterTest = command.match(
		/pnpm --filter (\S+) test(?:\s+--\s+--run\b)?/,
	);
	if (filterTest && /-- --run\b/.test(command)) {
		const pkg = packages.get(filterTest[1]);
		const testScript = pkg?.scripts?.test ?? "";
		if (/\bnode\b/.test(testScript) && /--test\b/.test(testScript)) {
			return {
				status: "cannot-run",
				reason: `${filterTest[1]} test is node --test; --run is Node's script runner (matches nothing, exits 0 — cannot check)`,
			};
		}
	}

	return { status: "runnable", reason: null };
}

const NAME_FILTER_RE =
	/(?:^|\s)(?:-t|--testNamePattern|--test-name-pattern)(?:\s|=)/;
const PATH_GLOB_RE =
	/(?:^|[\s])((?:packages|scripts|spec(?:-v[23])?|playground)\/[^\s]*\*[^\s]*)/g;

/**
 * Structural defects that make a gate unable to fail (or unable to pass)
 * regardless of how sensible the command looks when read. Matching nothing
 * on a vitest `-t` / Node `--test-name-pattern` exits 0. A path glob that
 * expands to zero files is a population claim over the empty set.
 *
 * This does not change `classifyGate` status — off-limits waves still
 * report `cannot-run 0` until their owners rewrite the commands. Use
 * `--scope-lint` to fail on these by name.
 */
export function detectScopeDefects(gate, repoRoot, packages) {
	const command = gate.command ?? "";
	const defects = [];

	if (NAME_FILTER_RE.test(command)) {
		defects.push({
			class: "cannot-fail-name-filter",
			reason: "name filter matching nothing skips tests and exits 0",
		});
	}

	const positional = command.match(/\s--\s+([A-Za-z][\w-]*)\s*$/);
	if (positional && !NAME_FILTER_RE.test(command)) {
		defects.push({
			class: "cannot-fail-name-filter",
			reason: `vitest positional filter "${positional[1]}" matching nothing exits 0`,
		});
	}

	PATH_GLOB_RE.lastIndex = 0;
	let globMatch = PATH_GLOB_RE.exec(command);
	while (globMatch) {
		const pattern = globMatch[1].replace(/[)\\`]+$/g, "");
		if (/[$\n{]/.test(pattern)) {
			globMatch = PATH_GLOB_RE.exec(command);
			continue;
		}
		const matched = expandPathGlob(repoRoot, pattern);
		if (matched.length === 0) {
			defects.push({
				class: "empty-population",
				reason: `glob ${pattern} matched 0 files`,
			});
		}
		globMatch = PATH_GLOB_RE.exec(command);
	}

	if (!/^\s*test\s/.test(command)) {
		for (const filterMatch of command.matchAll(/pnpm --filter (\S+)/g)) {
			const pkg = filterMatch[1];
			if (packages && !packages.has(pkg)) {
				defects.push({
					class: "cannot-fail-empty-filter",
					reason: `pnpm --filter ${pkg} matches no package and exits 0`,
				});
			}
		}
	}

	return defects;
}

function expandPathGlob(repoRoot, pattern) {
	try {
		return globSync(pattern, { cwd: repoRoot });
	} catch {
		return [];
	}
}

export function collectScopeDefects(entries, repoRoot, packages) {
	const found = [];
	for (const entry of entries) {
		for (const gate of entry.gates) {
			for (const defect of detectScopeDefects(gate, repoRoot, packages)) {
				found.push({
					id: gate.id,
					file: gate.file,
					command: gate.command,
					class: defect.class,
					reason: defect.reason,
				});
			}
		}
	}
	return found;
}

export function formatPopulation(entries, repoRoot) {
	const totalGates = entries.reduce((sum, entry) => sum + entry.gates.length, 0);
	const lines = [
		`population: ${entries.length} wave files, ${totalGates} gates`,
	];
	for (const entry of entries) {
		const rel = path.relative(repoRoot, entry.file).split(path.sep).join("/");
		lines.push(`  ${rel}  ${entry.gates.length} gates`);
	}
	return lines.join("\n");
}

/**
 * Long enough for a browser suite under load, short enough that a gate waiting
 * on input cannot consume the whole run. A timeout is reported as a distinct
 * failure, never as a silent pass.
 */
export const GATE_TIMEOUT_MS = 900_000;

export function executeGate(gate, repoRoot, timeoutMs = GATE_TIMEOUT_MS) {
	const result = spawnSync(commandShell(), ["-c", gate.command], {
		cwd: repoRoot,
		encoding: "utf8",
		env: process.env,
		maxBuffer: 8 * 1024 * 1024,
		input: "",
		timeout: timeoutMs,
	});
	if (result.error && result.error.code === "ETIMEDOUT") {
		return {
			exitCode: 1,
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
			error: `gate exceeded ${timeoutMs}ms and was killed`,
			timedOut: true,
		};
	}
	const exitCode = result.error ? 1 : (result.status ?? 1);
	return {
		exitCode,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		error: result.error ? result.error.message : null,
		timedOut: false,
	};
}

function commandShell() {
	if (process.platform === "win32") {
		return process.env.ComSpec || "cmd.exe";
	}
	return "/bin/sh";
}

export function evaluateExecuted(gate, executed) {
	const want = expectedExit(gate.expect);
	if (executed.exitCode === want) {
		return {
			status: "pass",
			reason: `exit ${executed.exitCode}`,
		};
	}
	return {
		status: "fail",
		reason: `exit ${executed.exitCode}, expected ${want}`,
	};
}

export function runGates(options) {
	const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
	const collected = collectWaveFiles(options.wavesDir, options.files ?? []);
	if (collected.error) {
		return {
			ok: false,
			error: collected.error,
			population: formatPopulation([], repoRoot),
			entries: [],
			results: [],
		};
	}

	const packages = options.packages ?? loadWorkspacePackages(repoRoot);
	const entries = [];
	const results = [];
	let emptyFile = null;

	for (const file of collected.files) {
		const gates = parseWaveFile(file);
		entries.push({ file, gates });
		if (gates.length === 0) {
			emptyFile = file;
		}
	}

	const population = formatPopulation(entries, repoRoot);
	if (emptyFile) {
		const rel = path.relative(repoRoot, emptyFile).split(path.sep).join("/");
		return {
			ok: false,
			error: `${CANNOT_CHECK_ZERO_GATES} (${rel})`,
			population,
			entries,
			results,
		};
	}

	for (const entry of entries) {
		for (const gate of entry.gates) {
			const classified = classifyGate(gate, repoRoot, packages);
			if (classified.status === "cannot-run" || options.preflight) {
				results.push({
					...gate,
					status: classified.status,
					reason: classified.reason,
				});
				continue;
			}
			const executed = executeGate(gate, repoRoot);
			const evaluated = evaluateExecuted(gate, executed);
			results.push({
				...gate,
				status: evaluated.status,
				reason: evaluated.reason,
				exitCode: executed.exitCode,
			});
		}
	}

	const ok = results.every((result) => result.status === "pass");
	const scopeDefects = collectScopeDefects(entries, repoRoot, packages);
	return {
		ok,
		error: ok ? null : "one or more gates did not pass",
		population,
		entries,
		results,
		scopeDefects,
		repoRoot,
	};
}

export function formatReport(run) {
	const lines = [run.population];
	if (run.error && run.results.length === 0) {
		lines.push(run.error);
		return lines.join("\n");
	}
	lines.push("");
	lines.push(
		`${pad("GATE", 8)} ${pad("KIND", 8)} ${pad("STATUS", 12)} COMMAND`,
	);
	for (const result of run.results) {
		lines.push(
			`${pad(result.id, 8)} ${pad(result.kind, 8)} ${pad(result.status, 12)} ${result.command}`,
		);
		if (result.reason) {
			lines.push(`${" ".repeat(30)}${result.reason}`);
		}
	}
	const counts = { pass: 0, fail: 0, "cannot-run": 0, runnable: 0 };
	for (const result of run.results) {
		counts[result.status] = (counts[result.status] ?? 0) + 1;
	}
	lines.push("");
	lines.push(
		`summary: ${counts.pass} pass, ${counts.fail} fail, ${counts["cannot-run"]} cannot-run, ${counts.runnable} classified-runnable`,
	);
	const scopeDefects = run.scopeDefects ?? [];
	if (scopeDefects.length > 0) {
		lines.push("");
		lines.push(`scope-defects: ${scopeDefects.length}`);
		for (const defect of scopeDefects) {
			const rel = run.repoRoot
				? path.relative(run.repoRoot, defect.file).split(path.sep).join("/")
				: defect.file;
			lines.push(`  ${defect.id}  ${rel}  ${defect.class}  ${defect.reason}`);
		}
	} else if (run.results.length > 0) {
		lines.push("scope-defects: 0");
	}
	if (run.error) {
		lines.push(run.error);
	}
	return lines.join("\n");
}

function pad(value, width) {
	const text = String(value);
	if (text.length >= width) {
		return text;
	}
	return text + " ".repeat(width - text.length);
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

export function runSelfTests(repoRoot = DEFAULT_REPO_ROOT) {
	assert(
		extractCommand(
			'`rg -n "an-fuzz" packages/tooling/conformance/vitest.nightly.ts` (population: 1 file)',
		) === 'rg -n "an-fuzz" packages/tooling/conformance/vitest.nightly.ts',
		"self-test: population parenthetical must not swallow a backticked command",
	);
	const packages = loadWorkspacePackages(repoRoot);
	const fixtureDir = path.join(repoRoot, "scripts", "__fixtures__");

	const missingDir = path.join(os.tmpdir(), `pen-v3-gates-absent-${process.pid}`);
	const absent = runGates({
		repoRoot,
		wavesDir: missingDir,
		files: [],
		preflight: true,
		packages,
	});
	assert(!absent.ok, "self-test: absent waves dir must fail");
	assert(
		absent.error === CANNOT_CHECK_ABSENT,
		`self-test: absent error, got ${absent.error}`,
	);
	assert(
		absent.population.startsWith("population: 0 wave files, 0 gates"),
		`self-test: absent population, got ${absent.population}`,
	);

	const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "pen-v3-gates-empty-"));
	const emptyTree = runGates({
		repoRoot,
		wavesDir: emptyDir,
		files: [],
		preflight: true,
		packages,
	});
	assert(!emptyTree.ok, "self-test: empty waves dir must fail");
	assert(
		emptyTree.error === CANNOT_CHECK_EMPTY_DIR,
		`self-test: empty-dir error, got ${emptyTree.error}`,
	);

	const emptyFile = path.join(fixtureDir, "empty-wave.md");
	const zeroGates = runGates({
		repoRoot,
		wavesDir: fixtureDir,
		files: [emptyFile],
		preflight: true,
		packages,
	});
	assert(!zeroGates.ok, "self-test: zero-gate file must fail");
	assert(
		zeroGates.error?.startsWith(CANNOT_CHECK_ZERO_GATES),
		`self-test: zero-gate error, got ${zeroGates.error}`,
	);
	assert(
		/empty-wave\.md {2}0 gates/.test(zeroGates.population),
		`self-test: zero-gate population, got ${zeroGates.population}`,
	);

	const failingFile = path.join(fixtureDir, "failing-wave.md");
	const failing = runGates({
		repoRoot,
		wavesDir: fixtureDir,
		files: [failingFile],
		preflight: false,
		packages,
	});
	assert(!failing.ok, "self-test: failing fixture must fail");
	assert(
		failing.results.every((result) => result.status === "fail"),
		`self-test: failing fixture statuses, got ${JSON.stringify(failing.results.map((r) => r.status))}`,
	);

	const classifyFile = path.join(fixtureDir, "classify-wave.md");
	const classified = runGates({
		repoRoot,
		wavesDir: fixtureDir,
		files: [classifyFile],
		preflight: false,
		packages,
	});
	assert(!classified.ok, "self-test: classify fixture must not pass");
	const byId = Object.fromEntries(
		classified.results.map((result) => [result.id, result]),
	);
	assert(
		byId["97.1"]?.status === "cannot-run",
		`self-test: prose gate must be cannot-run, got ${byId["97.1"]?.status}`,
	);
	assert(
		byId["97.2"]?.status === "cannot-run",
		`self-test: node --test --run must be cannot-run, got ${byId["97.2"]?.status}`,
	);
	assert(
		/node --test/.test(byId["97.2"]?.reason ?? ""),
		`self-test: --run reason must name node --test, got ${byId["97.2"]?.reason}`,
	);

	const passingFile = path.join(fixtureDir, "passing-wave.md");
	const passing = runGates({
		repoRoot,
		wavesDir: fixtureDir,
		files: [passingFile],
		preflight: false,
		packages,
	});
	assert(passing.ok, `self-test: passing fixture must pass: ${passing.error}`);
	assert(
		passing.results.every((result) => result.status === "pass"),
		`self-test: passing fixture statuses, got ${JSON.stringify(passing.results.map((r) => r.status))}`,
	);

	const scopeFile = path.join(fixtureDir, "scope-defect-wave.md");
	const scoped = parseWaveFile(scopeFile);
	const byScopeId = Object.fromEntries(scoped.map((gate) => [gate.id, gate]));
	const nameFilter = detectScopeDefects(byScopeId["96.1"], repoRoot, packages);
	assert(
		nameFilter.some((defect) => defect.class === "cannot-fail-name-filter"),
		`self-test: 96.1 must be cannot-fail-name-filter, got ${JSON.stringify(nameFilter)}`,
	);
	const nodeNameFilter = detectScopeDefects(byScopeId["96.2"], repoRoot, packages);
	assert(
		nodeNameFilter.some((defect) => defect.class === "cannot-fail-name-filter"),
		`self-test: 96.2 must be cannot-fail-name-filter, got ${JSON.stringify(nodeNameFilter)}`,
	);
	const emptyPop = detectScopeDefects(byScopeId["96.3"], repoRoot, packages);
	assert(
		emptyPop.some((defect) => defect.class === "empty-population"),
		`self-test: 96.3 must be empty-population, got ${JSON.stringify(emptyPop)}`,
	);
	assert(
		/convert\*\.ts/.test(emptyPop.find((defect) => defect.class === "empty-population")?.reason ?? ""),
		`self-test: 96.3 reason must name convert*.ts, got ${JSON.stringify(emptyPop)}`,
	);
	const clean = detectScopeDefects(byScopeId["96.4"], repoRoot, packages);
	assert(
		clean.length === 0,
		`self-test: 96.4 must be clean, got ${JSON.stringify(clean)}`,
	);
	const positional = detectScopeDefects(byScopeId["96.5"], repoRoot, packages);
	assert(
		positional.some((defect) => defect.class === "cannot-fail-name-filter"),
		`self-test: 96.5 must be cannot-fail-name-filter, got ${JSON.stringify(positional)}`,
	);

	const passingScope = collectScopeDefects(passing.entries, repoRoot, packages);
	assert(
		passingScope.length === 0,
		`self-test: passing fixture must have 0 scope defects, got ${JSON.stringify(passingScope)}`,
	);

	return {
		absent: absent.population,
		emptyFile: zeroGates.population,
		failing: formatReport(failing),
		classified: formatReport(classified),
		passing: formatReport(passing),
	};
}

function main() {
	const parsed = parseArgs(process.argv.slice(2));
	if (parsed.selfTest) {
		const reports = runSelfTests(parsed.repoRoot);
		console.log("v3-gates self-test ok");
		console.log(reports.absent);
		console.log(reports.emptyFile);
		console.log(reports.failing);
		console.log(reports.classified);
		return;
	}

	const run = runGates({
		repoRoot: parsed.repoRoot,
		wavesDir: parsed.wavesDir,
		files: parsed.files,
		preflight: parsed.preflight || parsed.scopeLint,
	});
	console.log(formatReport(run));
	if (parsed.scopeLint) {
		const n = run.scopeDefects?.length ?? 0;
		if (n > 0) {
			process.exitCode = 1;
		}
		return;
	}
	if (!run.ok) {
		process.exitCode = 1;
	}
}

const invokedDirectly =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
	main();
}
