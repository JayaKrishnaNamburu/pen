export interface BenchContext {
  start(): void;
  end(): void;
}

export interface BenchOptions {
  iterations?: number;
  warmup?: number;
}

export function bench(
  _name: string,
  _fn: (b: BenchContext) => Promise<void> | void,
  _options?: BenchOptions,
): void {
  throw new Error("Not implemented");
}
