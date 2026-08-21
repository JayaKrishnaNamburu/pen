declare const process: {
	argv: string[];
	cwd(): string;
	exit(code: number): never;
};

import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	BENCH_GATE_SAMPLE_SIZE,
	getCriticalBenchFailures,
	runSuite,
} from "./bench";
import { anchorsBenchmarks } from "./suites/anchors.bench";
import { crdtBenchmarks } from "./suites/crdt.bench";
import { schemaBenchmarks } from "./suites/schema.bench";
import { streamingBenchmarks } from "./suites/streaming.bench";
import { editorBenchmarks } from "./suites/editor.bench";
import { extensionBenchmarks } from "./suites/extension.bench";
import { aiBenchmarks } from "./suites/ai.bench";
import { scale3Benchmarks } from "./suites/scale3.bench";
import {
	SCALE2_PLUS8_BASE_ID,
	SCALE2_PLUS8_ID,
	compareScale2Plus8Tolerance,
	formatScale2Plus8Tolerance,
} from "./constants/scale3";
import { reportConsole } from "./reporters/console";
import { reportJSON } from "./reporters/json";
import type { BenchDefinition, BenchResult, BenchWaiver } from "./bench";

export const DEFAULT_BENCH_WAIVER_FILE = "spec/benchWaivers.json";

export interface BenchSuite {
	name: string;
	benchmarks: BenchDefinition[];
}

export interface RunAllSuitesOptions {
	iterations?: number;
	warmup?: number;
	reporter?: "console" | "json";
	reportResults?: boolean;
	enforceTargets?: boolean;
	waivers?: BenchWaiver[];
	waiverFile?: string;
}

export function createBenchSuites(): BenchSuite[] {
	return [
		{ name: "CRDT", benchmarks: crdtBenchmarks },
		{ name: "Anchors", benchmarks: anchorsBenchmarks },
		{ name: "Schema", benchmarks: schemaBenchmarks },
		{ name: "Editor", benchmarks: editorBenchmarks },
		{ name: "Streaming", benchmarks: streamingBenchmarks },
		{ name: "Extensions", benchmarks: extensionBenchmarks },
		{ name: "AI", benchmarks: aiBenchmarks },
		{ name: "SCALE3", benchmarks: scale3Benchmarks },
	];
}

export function assertCriticalBenchmarkTargets(
	results: readonly BenchResult[],
	waivers: readonly BenchWaiver[] = [],
): void {
	const failures = getCriticalBenchFailures(results, waivers);

	if (failures.length === 0) {
		return;
	}

	const summary = failures
		.map(
			(result) =>
				`${result.name} (median ${result.p50Ms.toFixed(2)}ms over ${result.iterations}; p95 ${result.p95Ms.toFixed(2)}ms, max ${result.maxMs.toFixed(2)}ms trend)`,
		)
		.join(", ");
	throw new Error(`Critical benchmark targets failed: ${summary}`);
}

export function assertScale2Plus8Tolerance(
	results: readonly BenchResult[],
): void {
	const base = results.find((result) => result.id === SCALE2_PLUS8_BASE_ID);
	const plus8 = results.find((result) => result.id === SCALE2_PLUS8_ID);
	if (!base || !plus8) {
		throw new Error(
			"SCALE2 plus8 tolerance: missing same-run medians for the 1000-block shipped stack and the plus8 decorating stack",
		);
	}
	const compared = compareScale2Plus8Tolerance(plus8.p50Ms, base.p50Ms);
	if (!compared.ok) {
		throw new Error(formatScale2Plus8Tolerance(compared));
	}
}

export function parseBenchCLIArgs(args: readonly string[]): {
	reporter: "console" | "json";
	waiverFile?: string;
	envelope?: boolean;
	writeEnvelope?: boolean;
} {
	let reporter: "console" | "json" = "console";
	let waiverFile: string | undefined;
	let envelope: boolean | undefined;
	let writeEnvelope: boolean | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--json") {
			reporter = "json";
			continue;
		}

		if (arg === "--envelope") {
			envelope = true;
			continue;
		}

		if (arg === "--write-envelope") {
			writeEnvelope = true;
			envelope = true;
			continue;
		}

		if (arg === "--waivers") {
			waiverFile = args[i + 1];
			if (!waiverFile) {
				throw new Error("Missing value for --waivers");
			}
			i += 1;
			continue;
		}

		if (arg.startsWith("--waivers=")) {
			waiverFile = arg.slice("--waivers=".length);
		}
	}

	return {
		reporter,
		...(waiverFile ? { waiverFile } : {}),
		...(envelope ? { envelope } : {}),
		...(writeEnvelope ? { writeEnvelope } : {}),
	};
}

export async function loadBenchWaivers(
	waiverFile?: string,
): Promise<BenchWaiver[]> {
	const resolvedWaiverFile =
		waiverFile ??
		(await resolveDefaultWaiverFilePath(process.cwd())) ??
		(await resolvePackageWaiverFilePath());
	if (!resolvedWaiverFile) {
		return [];
	}

	const raw = await readFile(resolvedWaiverFile, "utf8");
	const parsed = JSON.parse(raw) as unknown;
	const entries = isBenchWaiverDocument(parsed) ? parsed.waivers : null;

	if (!entries) {
		throw new Error(
			"Benchmark waivers file must contain a { waivers: [] } document",
		);
	}

	return entries.map((entry, index) => {
		if (!isBenchWaiverEntry(entry)) {
			throw new Error(
				`Invalid benchmark waiver at index ${index}: expected { benchId, rationale, owner, issue?, expiresOn? }`,
			);
		}

		return entry;
	});
}

export async function resolveDefaultWaiverFilePath(
	startDirectory: string,
): Promise<string | undefined> {
	let current = resolve(startDirectory);

	while (true) {
		const candidate = resolve(current, DEFAULT_BENCH_WAIVER_FILE);
		try {
			await access(candidate);
			return candidate;
		} catch {
			// Try the parent directory next.
		}

		const parent = dirname(current);
		if (parent === current) {
			return undefined;
		}
		current = parent;
	}
}

/** SCALE3 / API10: committed file lives in this package when cwd has no `spec/`. */
export async function resolvePackageWaiverFilePath(): Promise<
	string | undefined
> {
	const candidate = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"..",
		DEFAULT_BENCH_WAIVER_FILE,
	);
	try {
		await access(candidate);
		return candidate;
	} catch {
		// no waiver file at this path.
		return undefined;
	}
}

function isBenchWaiverDocument(
	value: unknown,
): value is { waivers: unknown[] } {
	return (
		!!value &&
		typeof value === "object" &&
		"waivers" in value &&
		Array.isArray(value.waivers)
	);
}

function isBenchWaiverEntry(value: unknown): value is BenchWaiver {
	return (
		!!value &&
		typeof value === "object" &&
		"benchId" in value &&
		typeof value.benchId === "string" &&
		"rationale" in value &&
		typeof value.rationale === "string" &&
		"owner" in value &&
		typeof value.owner === "string" &&
		(!("issue" in value) ||
			value.issue === undefined ||
			typeof value.issue === "string") &&
		(!("expiresOn" in value) ||
			value.expiresOn === undefined ||
			isISODate(value.expiresOn))
	);
}

function isISODate(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^\d{4}-\d{2}-\d{2}$/.test(value) &&
		!Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())
	);
}

export async function runAllSuites(
	options: RunAllSuitesOptions = {},
): Promise<Array<{ suite: string; results: BenchResult[] }>> {
	const reporter = options.reporter ?? "console";
	const reportResults = options.reportResults ?? false;
	const enforceTargets = options.enforceTargets ?? false;
	const waivers =
		options.waivers ?? (await loadBenchWaivers(options.waiverFile));
	const allResults: Array<{ suite: string; results: BenchResult[] }> = [];

	const suites = createBenchSuites();

	for (const suite of suites) {
		const results = await runSuite(suite.name, suite.benchmarks, {
			iterations: options.iterations ?? BENCH_GATE_SAMPLE_SIZE,
			warmup: options.warmup ?? 3,
			reporter,
		});

		allResults.push({ suite: suite.name, results });

		if (reportResults && reporter === "console") {
			reportConsole(suite.name, results, waivers);
		}
	}

	if (reportResults && reporter === "json") {
		for (const { suite, results } of allResults) {
			console.log(reportJSON(suite, results, waivers));
		}
	}

	if (enforceTargets) {
		const results = allResults.flatMap((suite) => suite.results);
		assertCriticalBenchmarkTargets(results, waivers);
		assertScale2Plus8Tolerance(results);
	}

	return allResults;
}
