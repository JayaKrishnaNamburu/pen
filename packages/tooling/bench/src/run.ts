declare const process: { argv: string[]; exit(code: number): never };

import { runSuite } from "./bench";
import { crdtBenchmarks } from "./suites/crdt.bench";
import { schemaBenchmarks } from "./suites/schema.bench";
import { streamingBenchmarks } from "./suites/streaming.bench";
import { editorBenchmarks } from "./suites/editor.bench";
import { extensionBenchmarks } from "./suites/extension.bench";
import { reportConsole } from "./reporters/console";
import { reportJSON } from "./reporters/json";
import type { BenchResult } from "./bench";

const reporter = process.argv.includes("--json") ? "json" : "console";
const allResults: Array<{ suite: string; results: BenchResult[] }> = [];

async function main() {
  const suites = [
    { name: "CRDT", benchmarks: crdtBenchmarks },
    { name: "Schema", benchmarks: schemaBenchmarks },
    { name: "Editor", benchmarks: editorBenchmarks },
    { name: "Streaming", benchmarks: streamingBenchmarks },
    { name: "Extensions", benchmarks: extensionBenchmarks },
  ];

  for (const suite of suites) {
    const results = await runSuite(suite.name, suite.benchmarks, {
      iterations: 50,
      warmup: 3,
    });
    allResults.push({ suite: suite.name, results });

    if (reporter === "console") {
      reportConsole(suite.name, results);
    }
  }

  if (reporter === "json") {
    for (const { suite, results } of allResults) {
      console.log(reportJSON(suite, results));
    }
  }
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
