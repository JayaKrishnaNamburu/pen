import { getBenchTarget } from "../bench";
import type { BenchResult } from "../bench";

export interface BenchReportResult extends BenchResult {
  targetMs?: number;
  meetsTarget: boolean;
}

export interface BenchReport {
  suite: string;
  timestamp: string;
  results: BenchReportResult[];
}

export function reportJSON(
  suiteName: string,
  results: BenchResult[],
): string {
  const report: BenchReport = {
    suite: suiteName,
    timestamp: new Date().toISOString(),
    results: results.map((result) => {
      const targetMs = getBenchTarget(result.name);

      return {
        ...result,
        targetMs: targetMs === Infinity ? undefined : targetMs,
        meetsTarget: targetMs === Infinity || result.p95Ms <= targetMs,
      };
    }),
  };
  return JSON.stringify(report, null, 2);
}
