import {
  defaultBlocks,
  defaultInlines,
} from "../../schema/default/src/defs.js";
import { SchemaRegistryImpl } from "./schema/registry.js";

export function createBuiltInDefaultSchema(): SchemaRegistryImpl {
  return new SchemaRegistryImpl({
    blocks: defaultBlocks,
    inlines: defaultInlines,
  });
}

export const builtInDefaultSchema = createBuiltInDefaultSchema();
