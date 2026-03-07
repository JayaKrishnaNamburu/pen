import type {
  ComposableSchema,
  ContentType,
  InlineSchema,
  PropSchema,
  BlockSchema,
} from "@pen/types";
import { SchemaRegistryImpl } from "@pen/core";
import { defaultBlocks, defaultInlines } from "./defs.js";

export function createDefaultSchema(): ComposableSchema {
  return new SchemaRegistryImpl({
    blocks: defaultBlocks as BlockSchema[],
    inlines: defaultInlines as InlineSchema[],
  });
}
