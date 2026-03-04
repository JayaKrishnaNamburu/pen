import type { Transport } from "@pen/core";

export type { Transport };

export function directTransport(): Transport {
  throw new Error("Not implemented");
}
