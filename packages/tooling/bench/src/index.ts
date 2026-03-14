export {
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
export { createLargeDocument } from "./fixtures/largeDoc";
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
	runAllSuites,
} from "./run";
export type { BenchSuite, RunAllSuitesOptions } from "./run";
