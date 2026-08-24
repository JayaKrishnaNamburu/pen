import {
	findBenchMetadataById,
	findBenchMetadataByName,
} from "./constants/benchmarks";
import {
	assertObservedCount,
	assertPublishedObservation,
	type PublishedObservation,
} from "./harness/observe";

export interface BenchContext {
	start(): void;
	end(): void;
	setMetrics(metrics: BenchMetrics): void;
	/**
	 * Post-clock named count. A no-op cannot satisfy `expected`.
	 * `runSuite` refuses to publish without this.
	 */
	observe(name: string, actual: number, expected: number): void;
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
	/** Timed with Pen removed. Absent means the wall-clock is not attributed. */
	floorP50Ms?: number;
	/** max(0, p50Ms - floorP50Ms). Absent when there is no floor. */
	attributedP50Ms?: number;
	/** Post-clock named count. Absent means the bench did not observe. */
	observation?: PublishedObservation;
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
	/**
	 * Same start/end loop as `fn` with Pen removed. `runSuite` times it
	 * alongside and records `floorP50Ms` / `attributedP50Ms`. A wall-clock
	 * without this is not attributed to Pen.
	 */
	floor?: (b: BenchContext) => void | Promise<void>;
	teardown?: () => void | Promise<void>;
	targetMs?: number;
	critical?: boolean;
	/** SCALE3: isolated axis, when the suite can vary one. */
	axis?: string;
	axisPoint?: number;
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

/** CH8: critical budgets are judged on the median of this many measured iterations. */
export const BENCH_GATE_SAMPLE_SIZE = 50;

export async function bench(
	name: string,
	fn: (b: BenchContext) => void | Promise<void>,
	options?: BenchOptions,
): Promise<BenchResult> {
	const iterations = options?.iterations ?? 100;
	const warmup = options?.warmup ?? 5;
	const times: number[] = [];
	let metrics: BenchMetrics | undefined;
	let observation: PublishedObservation | undefined;

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
		if (ctx._observation) {
			observation = ctx._observation;
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
		observation,
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
		if (benchmark.axis != null) {
			result.metrics = {
				axis: benchmark.axis,
				...(benchmark.axisPoint != null
					? { axisPoint: benchmark.axisPoint }
					: {}),
				...result.metrics,
			};
		}
		if (benchmark.floor) {
			const floor = await bench(
				`${benchmark.name} harness floor`,
				benchmark.floor,
				options,
			);
			result.floorP50Ms = floor.p50Ms;
			result.attributedP50Ms = attributeBenchResult(result);
			if (floor.metrics) {
				result.metrics = {
					...result.metrics,
					...prefixFloorMetrics(floor.metrics),
				};
			}
		}
		assertPublishedObservation(
			result.id,
			result.observation ?? null,
			typeof benchmark.floor === "function",
		);
		results.push(result);
		await benchmark.teardown?.();
	}

	return results;
}

/**
 * A wall-clock without a recorded floor is not Pen. The 12.8x streaming
 * "regression" was 100 `setTimeout(0)` yields attributed to apply.
 */
export function attributeBenchResult(result: BenchResult): number {
	if (
		typeof result.floorP50Ms !== "number" ||
		!Number.isFinite(result.floorP50Ms)
	) {
		throw new Error(
			`harness floor missing for ${result.id}; a wall-clock without a floor is not attributed to Pen`,
		);
	}
	return Math.max(0, result.p50Ms - result.floorP50Ms);
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
		findBenchMetadataById(result.id) ??
		findBenchMetadataByName(result.name);
	const targetMs = result.targetMs ?? metadata?.targetMs;
	const isCritical = result.isCritical || metadata?.critical === true;
	// CH8: gate on the median. P95 and Max stay on the result for trend output only.
	const meetsTarget = targetMs === undefined || result.p50Ms <= targetMs;
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
	_observation: PublishedObservation | null;
} {
	let startTime = 0;
	const ctx = {
		_elapsed: null as number | null,
		_metrics: null as BenchMetrics | null,
		_observation: null as PublishedObservation | null,
		start() {
			startTime = performance.now();
		},
		end() {
			ctx._elapsed = performance.now() - startTime;
		},
		setMetrics(metrics: BenchMetrics) {
			ctx._metrics = { ...ctx._metrics, ...metrics };
		},
		observe(name: string, actual: number, expected: number) {
			assertObservedCount(name, actual, expected);
			ctx._observation = { name, actual, expected };
			ctx._metrics = {
				...ctx._metrics,
				observation: name,
				[name]: actual,
			};
		},
	};
	return ctx;
}

function prefixFloorMetrics(metrics: BenchMetrics): BenchMetrics {
	const prefixed: BenchMetrics = {};
	for (const [key, value] of Object.entries(metrics)) {
		if (key.startsWith("floor")) {
			prefixed[key] = value;
			continue;
		}
		prefixed[`floor${key.charAt(0).toUpperCase()}${key.slice(1)}`] = value;
	}
	return prefixed;
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
