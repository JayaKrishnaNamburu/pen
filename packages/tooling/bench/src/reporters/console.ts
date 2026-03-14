import { evaluateBenchResult } from "../bench";
import type { BenchResult, BenchWaiver } from "../bench";

export function reportConsole(
  suiteName: string,
  results: BenchResult[],
  waivers: readonly BenchWaiver[] = [],
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
    const evaluation = evaluateBenchResult(r, waivers);
    const status =
      evaluation.meetsTarget || (evaluation.waiver && !evaluation.waiverExpired)
        ? "\u2713"
        : "\u2717";
    const targetLabel =
      evaluation.targetMs === undefined
        ? "baseline"
        : `<${evaluation.targetMs}ms`;
    const gateLabel = evaluation.waiver
      ? evaluation.waiverExpired
        ? `expired:${evaluation.waiver.owner}`
        : `waived:${evaluation.waiver.owner}`
      : evaluation.isCritical
        ? "critical"
        : "tracked";
    console.error(
      `  ${`${status} ${r.name}`.padEnd(nameWidth + 2)}  ${r.averageMs.toFixed(2).padStart(10)}  ${r.p50Ms.toFixed(2).padStart(10)}  ${r.p95Ms.toFixed(2).padStart(10)}  ${r.minMs.toFixed(2).padStart(10)}  ${r.maxMs.toFixed(2).padStart(10)}  ${r.opsPerSecond.toFixed(0).padStart(10)}  ${`${targetLabel} ${gateLabel}`.padStart(19)}`,
    );
    if (r.metrics && Object.keys(r.metrics).length > 0) {
      console.error(`    metrics: ${formatBenchMetrics(r.metrics)}`);
    }
  }

  console.error("");
}

function formatBenchMetrics(
  metrics: Record<string, string | number | boolean>,
): string {
  return Object.entries(metrics)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
}
