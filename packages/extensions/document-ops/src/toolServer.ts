import type { ToolRuntime, ToolDefinition, ToolContext } from "@pen/types";

export class ToolRuntimeImpl implements ToolRuntime {
  private readonly _tools = new Map<string, ToolDefinition>();

  registerTool(def: ToolDefinition): void {
    if (this._tools.has(def.name)) {
      throw new Error(`Tool "${def.name}" is already registered`);
    }
    this._tools.set(def.name, def);
  }

  unregisterTool(name: string): void {
    this._tools.delete(name);
  }

  listTools(): readonly ToolDefinition[] {
    return [...this._tools.values()];
  }

  getTool(name: string): ToolDefinition | null {
    return this._tools.get(name) ?? null;
  }

  async executeTool(
    name: string,
    input: unknown,
    ctx: ToolContext,
  ): Promise<unknown> {
    const def = this.getTool(name);
    if (!def) {
      throw new Error(`Unknown tool: "${name}"`);
    }

    if (def.inputSchema) {
      const errors = validateInput(input, def.inputSchema as Record<string, unknown>);
      if (errors.length > 0) {
        throw new Error(
          `Invalid input for tool "${name}": ${errors.join("; ")}`,
        );
      }
    }

    const result = await def.handler(input, ctx);
    return result;
  }
}

function validateInput(
  input: unknown,
  schema: Record<string, unknown>,
): string[] {
  return validateAgainstSchema(input, schema, "");
}

function validateAgainstSchema(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
): string[] {
  const errors: string[] = [];
  const fieldLabel = path.length > 0 ? `Field "${path}"` : "Input";
  const anyOf = Array.isArray(schema.anyOf)
    ? (schema.anyOf as Record<string, unknown>[])
    : null;
  if (anyOf) {
    for (const candidate of anyOf) {
      if (validateAgainstSchema(value, candidate, path).length === 0) {
        return errors;
      }
    }
    errors.push(`${fieldLabel} must match one of the allowed schemas`);
    return errors;
  }
  const expectedType = typeof schema.type === "string" ? schema.type : null;

  if (expectedType === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      errors.push(`${fieldLabel} must be an object`);
      return errors;
    }

    const inputObj = value as Record<string, unknown>;
    const required = Array.isArray(schema.required)
      ? (schema.required as string[])
      : [];
    const properties =
      schema.properties && typeof schema.properties === "object"
        ? (schema.properties as Record<string, Record<string, unknown>>)
        : {};
    const additionalProperties = schema.additionalProperties;

    for (const key of required) {
      if (!(key in inputObj) || inputObj[key] === undefined) {
        errors.push(`Missing required field: "${joinPath(path, key)}"`);
      }
    }

    for (const [key, entryValue] of Object.entries(inputObj)) {
      const propertySchema = properties[key];
      if (!propertySchema) {
        if (additionalProperties === true) {
          continue;
        }
        if (
          additionalProperties &&
          typeof additionalProperties === "object" &&
          !Array.isArray(additionalProperties)
        ) {
          errors.push(
            ...validateAgainstSchema(
              entryValue,
              additionalProperties as Record<string, unknown>,
              joinPath(path, key),
            ),
          );
          continue;
        }
        errors.push(`Unknown field: "${joinPath(path, key)}"`);
        continue;
      }
      errors.push(
        ...validateAgainstSchema(entryValue, propertySchema, joinPath(path, key)),
      );
    }

    return errors;
  }

  if (expectedType === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${fieldLabel} must be an array`);
      return errors;
    }

    if (
      typeof schema.minItems === "number" &&
      value.length < schema.minItems
    ) {
      errors.push(
        `${fieldLabel} must contain at least ${schema.minItems} items`,
      );
    }
    if (
      typeof schema.maxItems === "number" &&
      value.length > schema.maxItems
    ) {
      errors.push(
        `${fieldLabel} must contain no more than ${schema.maxItems} items`,
      );
    }

    const itemSchema =
      schema.items && typeof schema.items === "object"
        ? (schema.items as Record<string, unknown>)
        : null;
    if (itemSchema) {
      for (let index = 0; index < value.length; index += 1) {
        errors.push(
          ...validateAgainstSchema(
            value[index],
            itemSchema,
            `${path}[${index}]`,
          ),
        );
      }
    }

    return errors;
  }

  if (expectedType === "string" && typeof value !== "string") {
    errors.push(`${fieldLabel} must be a string, got ${typeof value}`);
  } else if (
    expectedType === "string" &&
    typeof value === "string" &&
    typeof schema.minLength === "number" &&
    value.length < schema.minLength
  ) {
    errors.push(
      `${fieldLabel} must be at least ${schema.minLength} characters long`,
    );
  }
  if (expectedType === "number" && typeof value !== "number") {
    errors.push(`${fieldLabel} must be a number, got ${typeof value}`);
  } else if (expectedType === "number" && typeof value === "number") {
    if (
      typeof schema.minimum === "number" &&
      value < schema.minimum
    ) {
      errors.push(`${fieldLabel} must be at least ${schema.minimum}`);
    }
    if (
      typeof schema.maximum === "number" &&
      value > schema.maximum
    ) {
      errors.push(`${fieldLabel} must be at most ${schema.maximum}`);
    }
  }
  if (expectedType === "boolean" && typeof value !== "boolean") {
    errors.push(`${fieldLabel} must be a boolean, got ${typeof value}`);
  }

  const enumValues = Array.isArray(schema.enum) ? schema.enum : null;
  if (enumValues && !enumValues.includes(value)) {
    errors.push(`${fieldLabel} must be one of: ${enumValues.join(", ")}`);
  }

  return errors;
}

function joinPath(basePath: string, key: string): string {
  return basePath.length > 0 ? `${basePath}.${key}` : key;
}
