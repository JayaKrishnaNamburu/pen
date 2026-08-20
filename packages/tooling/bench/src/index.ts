export {
	BENCH_GATE_SAMPLE_SIZE,
	bench,
	runSuite,
	getBenchTarget,
	isCriticalBench,
	evaluateBenchResult,
	getCriticalBenchFailures,
	isBenchWaiverExpired,
} from "./bench";
export type {
	BenchContext,
	BenchResult,
	BenchOptions,
	BenchDefinition,
	BenchEvaluation,
	BenchWaiver,
} from "./bench";

export { crdtBenchmarks } from "./suites/crdt.bench";
export { schemaBenchmarks } from "./suites/schema.bench";
export { streamingBenchmarks } from "./suites/streaming.bench";
export { editorBenchmarks } from "./suites/editor.bench";
export { extensionBenchmarks } from "./suites/extension.bench";
export { scale3Benchmarks } from "./suites/scale3.bench";
export { createLargeDocument } from "./fixtures/largeDoc";
export { createScale3Editor } from "./fixtures/scale3Stack";
export {
	SCALE3_AXES,
	SCALE3_BASELINES,
	SCALE3_MACHINE_CLASS,
	SCALE3_SHIPPED_STACK,
	getScale3Baseline,
} from "./constants/scale3";
export type { Scale3Axis, Scale3Baseline } from "./constants/scale3";
export { generateGenDeltaParts } from "./fixtures/streamingParts";

export { reportConsole } from "./reporters/console";
export { reportJSON } from "./reporters/json";
export type { BenchReport, BenchReportResult } from "./reporters/json";
export {
	DEFAULT_BENCH_WAIVER_FILE,
	assertCriticalBenchmarkTargets,
	createBenchSuites,
	loadBenchWaivers,
	parseBenchCLIArgs,
	resolveDefaultWaiverFilePath,
	resolvePackageWaiverFilePath,
	runAllSuites,
} from "./run";
export type { BenchSuite, RunAllSuitesOptions } from "./run";
