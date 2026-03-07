import type { BenchResult } from "../bench.js";

export function reportConsole(
  suiteName: string,
  results: BenchResult[],
): void {
  const nameWidth = Math.max(...results.map((r) => r.name.length), 10);

  console.error(`\n  ${"=".repeat(nameWidth + 60)}`);
  console.error(`  Suite: ${suiteName}`);
  console.error(`  ${"=".repeat(nameWidth + 60)}\n`);

  console.error(
    `  ${"Benchmark".padEnd(nameWidth)}  ${"Avg (ms)".padStart(10)}  ${"Min (ms)".padStart(10)}  ${"Max (ms)".padStart(10)}  ${"ops/s".padStart(10)}`,
  );
  console.error(`  ${"-".repeat(nameWidth + 48)}`);

  for (const r of results) {
    console.error(
      `  ${r.name.padEnd(nameWidth)}  ${r.averageMs.toFixed(2).padStart(10)}  ${r.minMs.toFixed(2).padStart(10)}  ${r.maxMs.toFixed(2).padStart(10)}  ${r.opsPerSecond.toFixed(0).padStart(10)}`,
    );
  }

  console.error("");
}
