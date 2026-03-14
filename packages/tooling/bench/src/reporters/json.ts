import { evaluateBenchResult } from "../bench";
import type { BenchResult, BenchWaiver } from "../bench";

export interface BenchReportResult extends BenchResult {
  meetsTarget: boolean;
  waiver?: BenchWaiver;
  waiverExpired: boolean;
}

export interface BenchReport {
  suite: string;
  timestamp: string;
  results: BenchReportResult[];
}

export function reportJSON(
  suiteName: string,
  results: BenchResult[],
  waivers: readonly BenchWaiver[] = [],
): string {
  const report: BenchReport = {
    suite: suiteName,
    timestamp: new Date().toISOString(),
    results: results.map((result) => {
      const evaluation = evaluateBenchResult(result, waivers);

      return {
        ...result,
        targetMs: evaluation.targetMs,
        meetsTarget: evaluation.meetsTarget,
        isCritical: evaluation.isCritical,
        waiver: evaluation.waiver,
        waiverExpired: evaluation.waiverExpired,
      };
    }),
  };
  return JSON.stringify(report, null, 2);
}
