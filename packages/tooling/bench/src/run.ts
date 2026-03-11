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

export interface BenchSuite {
  name: string;
  benchmarks: Array<{
    name: string;
    fn: Parameters<typeof runSuite>[1][number]["fn"];
  }>;
}

export interface RunAllSuitesOptions {
  iterations?: number;
  warmup?: number;
  reporter?: "console" | "json";
  reportResults?: boolean;
}

export function createBenchSuites(): BenchSuite[] {
  return [
    { name: "CRDT", benchmarks: crdtBenchmarks },
    { name: "Schema", benchmarks: schemaBenchmarks },
    { name: "Editor", benchmarks: editorBenchmarks },
    { name: "Streaming", benchmarks: streamingBenchmarks },
    { name: "Extensions", benchmarks: extensionBenchmarks },
  ];
}

export async function runAllSuites(
  options: RunAllSuitesOptions = {},
): Promise<Array<{ suite: string; results: BenchResult[] }>> {
  const reporter = options.reporter ?? "console";
  const reportResults = options.reportResults ?? false;
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
      reportConsole(suite.name, results);
    }
  }

  if (reportResults && reporter === "json") {
    for (const { suite, results } of allResults) {
      console.log(reportJSON(suite, results));
    }
  }

  return allResults;
}

const reporter = process.argv.includes("--json") ? "json" : "console";

async function main() {
  await runAllSuites({
    iterations: 50,
    warmup: 3,
    reporter,
    reportResults: true,
  });
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
