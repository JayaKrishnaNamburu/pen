import type { ComposableSchema, InlineSchema } from "@input/pen-types";
import { SchemaRegistryImpl } from "@input/pen-core";
import { defaultBlocks, defaultInlines } from "./defs";

export function createDefaultSchema(): ComposableSchema {
  return new SchemaRegistryImpl({
    blocks: defaultBlocks,
    inlines: defaultInlines as InlineSchema[],
    onUnknownBlock: () => "passthrough",
  });
}
