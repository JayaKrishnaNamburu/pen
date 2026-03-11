export { bench, runSuite, getBenchTarget } from "./bench";
export type {
  BenchContext,
  BenchResult,
  BenchOptions,
  BenchDefinition,
} from "./bench";

export { crdtBenchmarks } from "./suites/crdt.bench";
export { schemaBenchmarks } from "./suites/schema.bench";
export { streamingBenchmarks } from "./suites/streaming.bench";
export { editorBenchmarks } from "./suites/editor.bench";
export { extensionBenchmarks } from "./suites/extension.bench";
export { createLargeDocument } from "./fixtures/large-doc";
export { generateGenDeltaParts } from "./fixtures/streaming-parts";

export { reportConsole } from "./reporters/console";
export { reportJSON } from "./reporters/json";
export type { BenchReport, BenchReportResult } from "./reporters/json";
export { createBenchSuites, runAllSuites } from "./run";
export type { BenchSuite, RunAllSuitesOptions } from "./run";
