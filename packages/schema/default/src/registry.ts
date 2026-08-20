import type {
  ComposableSchema,
  ContentType,
  InlineSchema,
  PropSchema,
  BlockSchema,
} from "@input/pen-types";
import { SchemaRegistryImpl } from "@input/pen-types";
import { defaultBlocks, defaultInlines } from "./defs";

export function createDefaultSchema(): ComposableSchema {
  return new SchemaRegistryImpl({
    blocks: defaultBlocks as BlockSchema[],
    inlines: defaultInlines as InlineSchema[],
    onUnknownBlock: () => "passthrough",
  });
}
