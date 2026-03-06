import type { SchemaRegistry, ComposableSchema } from "@pen/types";

export function mergeSchemas(
  ..._schemas: SchemaRegistry[]
): ComposableSchema {
  throw new Error("Not implemented — mergeSchemas is available in Wave 2.");
}
