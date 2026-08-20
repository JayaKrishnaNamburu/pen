import { SchemaRegistryImpl } from "@input/pen-types";
import {
  defaultBlocks,
  defaultInlines,
} from "@input/pen-schema-default";

export function createBuiltInDefaultSchema(): SchemaRegistryImpl {
  return new SchemaRegistryImpl({
    blocks: defaultBlocks,
    inlines: defaultInlines,
    onUnknownBlock: () => "passthrough",
  });
}

export const builtInDefaultSchema = createBuiltInDefaultSchema();
