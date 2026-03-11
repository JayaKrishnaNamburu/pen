export interface BenchContext {
  start(): void;
  end(): void;
}

export interface BenchResult {
  name: string;
  iterations: number;
  totalMs: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  opsPerSecond: number;
}

export interface BenchOptions {
  iterations?: number;
  warmup?: number;
  reporter?: "console" | "json";
}

export interface BenchDefinition {
  name: string;
  fn: (b: BenchContext) => void | Promise<void>;
}

export async function bench(
  name: string,
  fn: (b: BenchContext) => void | Promise<void>,
  options?: BenchOptions,
): Promise<BenchResult> {
  const iterations = options?.iterations ?? 100;
  const warmup = options?.warmup ?? 5;
  const times: number[] = [];

  for (let i = 0; i < warmup; i++) {
    const ctx = createBenchContext();
    await fn(ctx);
  }

  for (let i = 0; i < iterations; i++) {
    const ctx = createBenchContext();
    await fn(ctx);
    if (ctx._elapsed !== null) {
      times.push(ctx._elapsed);
    }
  }

  const totalMs = times.reduce((a, b) => a + b, 0);
  const averageMs = totalMs / times.length;
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);
  const p50Ms = percentile(times, 50);
  const p95Ms = percentile(times, 95);
  const opsPerSecond = 1000 / averageMs;

  return {
    name,
    iterations: times.length,
    totalMs,
    averageMs,
    minMs,
    maxMs,
    p50Ms,
    p95Ms,
    opsPerSecond,
  };
}

export async function runSuite(
  name: string,
  benchmarks: BenchDefinition[],
  options?: BenchOptions,
): Promise<BenchResult[]> {
  const results: BenchResult[] = [];

  for (const benchmark of benchmarks) {
    const result = await bench(benchmark.name, benchmark.fn, options);
    results.push(result);
  }

  return results;
}

const TARGETS: Record<string, number> = {
  "insert 1000 blocks": 500,
  "normalize 500-block document": 200,
  "streaming 1000 gen-delta parts": 10,
  "encodestate 500-block document": 50,
  "loaddocument 500-block document": 100,
  "schema resolve x10000": 10,
  "extension dispatch": 1,
};

export function getBenchTarget(name: string): number {
  const lower = name.toLowerCase();
  for (const [key, target] of Object.entries(TARGETS)) {
    if (lower.includes(key)) return target;
  }
  return Infinity;
}

function createBenchContext(): BenchContext & { _elapsed: number | null } {
  let startTime = 0;
  const ctx = {
    _elapsed: null as number | null,
    start() {
      startTime = performance.now();
    },
    end() {
      ctx._elapsed = performance.now() - startTime;
    },
  };
  return ctx;
}

function percentile(values: number[], percentileRank: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileRank / 100) * sorted.length) - 1),
  );

  return sorted[index] ?? 0;
}
