export { bench, runSuite } from "./bench";
export type { BenchContext, BenchResult, BenchOptions } from "./bench";

export { crdtBenchmarks } from "./suites/crdt.bench";
export { schemaBenchmarks } from "./suites/schema.bench";
export { streamingBenchmarks } from "./suites/streaming.bench";
export { editorBenchmarks } from "./suites/editor.bench";
export { extensionBenchmarks } from "./suites/extension.bench";
export { createLargeDocument } from "./fixtures/large-doc";
export { generateGenDeltaParts } from "./fixtures/streaming-parts";

export { reportConsole } from "./reporters/console";
export { reportJSON } from "./reporters/json";
export type { BenchReport } from "./reporters/json";
