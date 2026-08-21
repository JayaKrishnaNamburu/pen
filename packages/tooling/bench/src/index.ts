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
export { scale1Benchmarks } from "./suites/scale1.bench";
export { createLargeDocument } from "./fixtures/largeDoc";
export { createScale3Editor } from "./fixtures/scale3Stack";
export { createEnvelopeEditor } from "./fixtures/envelope";
export {
	ENVELOPE_DRIFT_FLOOR_MS,
	ENVELOPE_DRIFT_RATIO,
	ENVELOPE_GATE_MIN_SIGNAL_MS,
	ENVELOPE_SAMPLE_SIZE,
	SCALE1_MACHINE_CLASS,
	SCALE1_MEASUREMENTS,
	envelopeGateP50Ms,
	envelopePointIsGated,
} from "./constants/scale1";
export type { EnvelopeAxis, EnvelopeRungId } from "./constants/scale1";
export { buildEnvelopeRecord, compareEnvelopeDrift } from "./envelope/compare";
export type { EnvelopeRecord } from "./envelope/compare";
export {
	SCALE2_PLUS8_BASE_ID,
	SCALE2_PLUS8_ID,
	SCALE2_PLUS8_TOLERANCE_FLOOR_MS,
	SCALE2_PLUS8_TOLERANCE_RATIO,
	SCALE3_AXES,
	SCALE3_BASELINES,
	SCALE3_MACHINE_CLASS,
	SCALE3_SHIPPED_STACK,
	compareScale2Plus8Tolerance,
	getScale3Baseline,
	scale2Plus8GateMs,
} from "./constants/scale3";
export type {
	Scale2Plus8ToleranceResult,
	Scale3Axis,
	Scale3Baseline,
} from "./constants/scale3";
export { generateGenDeltaParts } from "./fixtures/streamingParts";

export { reportConsole } from "./reporters/console";
export { reportJSON } from "./reporters/json";
export type { BenchReport, BenchReportResult } from "./reporters/json";
export {
	DEFAULT_BENCH_WAIVER_FILE,
	assertCriticalBenchmarkTargets,
	assertScale2Plus8Tolerance,
	createBenchSuites,
	loadBenchWaivers,
	parseBenchCLIArgs,
	resolveDefaultWaiverFilePath,
	resolvePackageWaiverFilePath,
	runAllSuites,
} from "./run";
export type { BenchSuite, RunAllSuitesOptions } from "./run";
