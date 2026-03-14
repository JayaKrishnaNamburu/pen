import {
	findBenchMetadataById,
	findBenchMetadataByName,
} from "./constants/benchmarks";

export interface BenchContext {
	start(): void;
	end(): void;
	setMetrics(metrics: BenchMetrics): void;
}

export type BenchMetricValue = string | number | boolean;

export type BenchMetrics = Record<string, BenchMetricValue>;

export interface BenchResult {
	id: string;
	name: string;
	iterations: number;
	totalMs: number;
	averageMs: number;
	minMs: number;
	maxMs: number;
	p50Ms: number;
	p95Ms: number;
	opsPerSecond: number;
	targetMs?: number;
	isCritical: boolean;
	metrics?: BenchMetrics;
}

export interface BenchOptions {
	iterations?: number;
	warmup?: number;
	reporter?: "console" | "json";
}

export interface BenchDefinition {
	id?: string;
	name: string;
	fn: (b: BenchContext) => void | Promise<void>;
	targetMs?: number;
	critical?: boolean;
}

export interface BenchWaiver {
	benchId: string;
	rationale: string;
	owner: string;
	issue?: string;
	expiresOn?: string;
}

export interface BenchEvaluation {
	targetMs?: number;
	meetsTarget: boolean;
	isCritical: boolean;
	waiver?: BenchWaiver;
	waiverExpired: boolean;
}

export async function bench(
	name: string,
	fn: (b: BenchContext) => void | Promise<void>,
	options?: BenchOptions,
): Promise<BenchResult> {
	const iterations = options?.iterations ?? 100;
	const warmup = options?.warmup ?? 5;
	const times: number[] = [];
	let metrics: BenchMetrics | undefined;

	for (let i = 0; i < warmup; i++) {
		const ctx = createBenchContext();
		await fn(ctx);
	}

	for (let i = 0; i < iterations; i++) {
		const ctx = createBenchContext();
		await fn(ctx);
		if (ctx._elapsed !== null) {
			times.push(ctx._elapsed);
		}
		if (ctx._metrics) {
			metrics = { ...ctx._metrics };
		}
	}

	const totalMs = times.reduce((a, b) => a + b, 0);
	const averageMs = totalMs / times.length;
	const minMs = Math.min(...times);
	const maxMs = Math.max(...times);
	const p50Ms = percentile(times, 50);
	const p95Ms = percentile(times, 95);
	const opsPerSecond = 1000 / averageMs;

	return {
		id: name,
		name,
		iterations: times.length,
		totalMs,
		averageMs,
		minMs,
		maxMs,
		p50Ms,
		p95Ms,
		opsPerSecond,
		isCritical: false,
		metrics,
	};
}

export async function runSuite(
	name: string,
	benchmarks: BenchDefinition[],
	options?: BenchOptions,
): Promise<BenchResult[]> {
	const results: BenchResult[] = [];

	for (const benchmark of benchmarks) {
		const result = await bench(benchmark.name, benchmark.fn, options);
		result.id = benchmark.id ?? benchmark.name;
		result.targetMs = benchmark.targetMs;
		result.isCritical = benchmark.critical ?? false;
		results.push(result);
	}

	return results;
}

export function getBenchTarget(name: string): number {
	return findBenchMetadataByName(name)?.targetMs ?? Infinity;
}

export function isCriticalBench(name: string): boolean {
	return findBenchMetadataByName(name)?.critical ?? false;
}

export function evaluateBenchResult(
	result: BenchResult,
	waivers: readonly BenchWaiver[] = [],
): BenchEvaluation {
	const metadata =
		findBenchMetadataById(result.id) ?? findBenchMetadataByName(result.name);
	const targetMs = result.targetMs ?? metadata?.targetMs;
	const isCritical = result.isCritical || metadata?.critical === true;
	const meetsTarget = targetMs === undefined || result.p95Ms <= targetMs;
	const waiver = waivers.find((candidate) => candidate.benchId === result.id);
	const waiverExpired = waiver ? isBenchWaiverExpired(waiver) : false;

	return {
		targetMs,
		meetsTarget,
		isCritical,
		waiver,
		waiverExpired,
	};
}

export function getCriticalBenchFailures(
	results: readonly BenchResult[],
	waivers: readonly BenchWaiver[] = [],
): BenchResult[] {
	return results.filter((result) => {
		const evaluation = evaluateBenchResult(result, waivers);
		return (
			evaluation.isCritical &&
			!evaluation.meetsTarget &&
			(!evaluation.waiver || evaluation.waiverExpired)
		);
	});
}

export function isBenchWaiverExpired(
	waiver: BenchWaiver,
	now = new Date(),
): boolean {
	if (!waiver.expiresOn) {
		return false;
	}

	const expiry = new Date(`${waiver.expiresOn}T23:59:59.999Z`);
	return Number.isNaN(expiry.getTime()) || expiry.getTime() < now.getTime();
}

function createBenchContext(): BenchContext & {
	_elapsed: number | null;
	_metrics: BenchMetrics | null;
} {
	let startTime = 0;
	const ctx = {
		_elapsed: null as number | null,
		_metrics: null as BenchMetrics | null,
		start() {
			startTime = performance.now();
		},
		end() {
			ctx._elapsed = performance.now() - startTime;
		},
		setMetrics(metrics: BenchMetrics) {
			ctx._metrics = { ...metrics };
		},
	};
	return ctx;
}

function percentile(values: number[], percentileRank: number): number {
	if (values.length === 0) {
		return 0;
	}

	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil((percentileRank / 100) * sorted.length) - 1),
	);

	return sorted[index] ?? 0;
}
