import type { BenchResult } from "../bench";

export interface BenchReport {
  suite: string;
  timestamp: string;
  results: BenchResult[];
}

export function reportJSON(
  suiteName: string,
  results: BenchResult[],
): string {
  const report: BenchReport = {
    suite: suiteName,
    timestamp: new Date().toISOString(),
    results,
  };
  return JSON.stringify(report, null, 2);
}
