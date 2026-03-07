export { bench, runSuite } from "./bench.js";
export type { BenchContext, BenchResult, BenchOptions } from "./bench.js";

export { crdtBenchmarks } from "./suites/crdt.bench.js";
export { schemaBenchmarks } from "./suites/schema.bench.js";
export { streamingBenchmarks } from "./suites/streaming.bench.js";
export { editorBenchmarks } from "./suites/editor.bench.js";
export { extensionBenchmarks } from "./suites/extension.bench.js";
export { createLargeDocument } from "./fixtures/large-doc.js";
export { generateGenDeltaParts } from "./fixtures/streaming-parts.js";

export { reportConsole } from "./reporters/console.js";
export { reportJSON } from "./reporters/json.js";
export type { BenchReport } from "./reporters/json.js";
