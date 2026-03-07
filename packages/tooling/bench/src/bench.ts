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
  opsPerSecond: number;
}

export interface BenchOptions {
  iterations?: number;
  warmup?: number;
  reporter?: "console" | "json";
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
  const opsPerSecond = 1000 / averageMs;

  return {
    name,
    iterations: times.length,
    totalMs,
    averageMs,
    minMs,
    maxMs,
    opsPerSecond,
  };
}

export async function runSuite(
  name: string,
  benchmarks: Array<{
    name: string;
    fn: (b: BenchContext) => void | Promise<void>;
  }>,
  options?: BenchOptions,
): Promise<BenchResult[]> {
  const results: BenchResult[] = [];

  console.error(`\n  Suite: ${name}\n`);

  for (const benchmark of benchmarks) {
    const result = await bench(benchmark.name, benchmark.fn, options);
    results.push(result);

    const status =
      result.averageMs < getTarget(benchmark.name) ? "\u2713" : "\u2717";
    console.error(
      `  ${status} ${result.name}: ${result.averageMs.toFixed(2)}ms avg ` +
        `(min: ${result.minMs.toFixed(2)}ms, max: ${result.maxMs.toFixed(2)}ms, ` +
        `${result.opsPerSecond.toFixed(0)} ops/s)`,
    );
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

function getTarget(name: string): number {
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
