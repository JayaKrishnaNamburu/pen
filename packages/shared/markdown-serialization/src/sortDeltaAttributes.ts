import type { SchemaRegistry } from "@pen/types";

export function sortDeltaAttributes(
  attributes: Record<string, unknown>,
  registry: SchemaRegistry,
): Record<string, unknown> {
  const keys = Object.keys(attributes);
  if (keys.length < 2) return attributes;

  const sorted = [...keys].sort((a, b) => {
    const schemaA = registry.resolveInline(a);
    const schemaB = registry.resolveInline(b);
    if (schemaA?.system || schemaB?.system) return 0;
    return (schemaA?.priority ?? 0) - (schemaB?.priority ?? 0);
  });

  const result: Record<string, unknown> = {};
  for (const key of sorted) {
    result[key] = attributes[key];
  }
  return result;
}
