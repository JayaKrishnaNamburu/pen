import { getBenchTarget } from "../bench";
import type { BenchResult } from "../bench";

export function reportConsole(
  suiteName: string,
  results: BenchResult[],
): void {
  const nameWidth = Math.max(...results.map((r) => r.name.length), 10);

  console.error(`\n  ${"=".repeat(nameWidth + 95)}`);
  console.error(`  Suite: ${suiteName}`);
  console.error(`  ${"=".repeat(nameWidth + 95)}\n`);

  console.error(
    `  ${"Benchmark".padEnd(nameWidth)}  ${"Avg (ms)".padStart(10)}  ${"P50 (ms)".padStart(10)}  ${"P95 (ms)".padStart(10)}  ${"Min (ms)".padStart(10)}  ${"Max (ms)".padStart(10)}  ${"ops/s".padStart(10)}  ${"Target".padStart(10)}`,
  );
  console.error(`  ${"-".repeat(nameWidth + 83)}`);

  for (const r of results) {
    const targetMs = getBenchTarget(r.name);
    const status = targetMs === Infinity || r.p95Ms <= targetMs ? "\u2713" : "\u2717";
    const targetLabel = targetMs === Infinity ? "baseline" : `<${targetMs}ms`;
    console.error(
      `  ${`${status} ${r.name}`.padEnd(nameWidth + 2)}  ${r.averageMs.toFixed(2).padStart(10)}  ${r.p50Ms.toFixed(2).padStart(10)}  ${r.p95Ms.toFixed(2).padStart(10)}  ${r.minMs.toFixed(2).padStart(10)}  ${r.maxMs.toFixed(2).padStart(10)}  ${r.opsPerSecond.toFixed(0).padStart(10)}  ${targetLabel.padStart(10)}`,
    );
  }

  console.error("");
}
