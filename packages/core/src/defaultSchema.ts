import { SchemaRegistryImpl } from "@input/pen-types";
import {
  defaultBlocks,
  defaultInlines,
} from "@input/pen-schema-default";

export function createBuiltInDefaultSchema(): SchemaRegistryImpl {
  return new SchemaRegistryImpl({
    blocks: defaultBlocks,
    inlines: defaultInlines,
  });
}

export const builtInDefaultSchema = createBuiltInDefaultSchema();
