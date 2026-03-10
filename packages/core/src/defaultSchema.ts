import {
  defaultBlocks,
  defaultInlines,
} from "../../schema/default/src/defs";
import { SchemaRegistryImpl } from "./schema/registry";

export function createBuiltInDefaultSchema(): SchemaRegistryImpl {
  return new SchemaRegistryImpl({
    blocks: defaultBlocks,
    inlines: defaultInlines,
  });
}

export const builtInDefaultSchema = createBuiltInDefaultSchema();
