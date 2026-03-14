declare const process: {
	argv: string[];
	cwd(): string;
	exit(code: number): never;
};

import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getCriticalBenchFailures, runSuite } from "./bench";
import { crdtBenchmarks } from "./suites/crdt.bench";
import { schemaBenchmarks } from "./suites/schema.bench";
import { streamingBenchmarks } from "./suites/streaming.bench";
import { editorBenchmarks } from "./suites/editor.bench";
import { extensionBenchmarks } from "./suites/extension.bench";
import { aiBenchmarks } from "./suites/ai.bench";
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
		{ name: "Schema", benchmarks: schemaBenchmarks },
		{ name: "Editor", benchmarks: editorBenchmarks },
		{ name: "Streaming", benchmarks: streamingBenchmarks },
		{ name: "Extensions", benchmarks: extensionBenchmarks },
		{ name: "AI", benchmarks: aiBenchmarks },
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
		.map((result) => `${result.name} (p95 ${result.p95Ms.toFixed(2)}ms)`)
		.join(", ");
	throw new Error(`Critical benchmark targets failed: ${summary}`);
}

export function parseBenchCLIArgs(args: readonly string[]): {
	reporter: "console" | "json";
	waiverFile?: string;
} {
	let reporter: "console" | "json" = "console";
	let waiverFile: string | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--json") {
			reporter = "json";
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

	return { reporter, waiverFile };
}

export async function loadBenchWaivers(
	waiverFile?: string,
): Promise<BenchWaiver[]> {
	const resolvedWaiverFile =
		waiverFile ?? (await resolveDefaultWaiverFilePath(process.cwd()));
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
			iterations: options.iterations ?? 50,
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
		assertCriticalBenchmarkTargets(
			allResults.flatMap((suite) => suite.results),
			waivers,
		);
	}

	return allResults;
}

async function main() {
	const { reporter, waiverFile } = parseBenchCLIArgs(process.argv.slice(2));

	await runAllSuites({
		iterations: 50,
		warmup: 3,
		reporter,
		reportResults: true,
		enforceTargets: true,
		waiverFile,
	});
}

main().catch((err) => {
	console.error("Benchmark failed:", err);
	process.exit(1);
});
