import type { ToolServer, ToolDefinition, ToolContext } from "@pen/types";

export class ToolServerImpl implements ToolServer {
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

  async executeTool(
    name: string,
    input: unknown,
    ctx: ToolContext,
  ): Promise<unknown> {
    const def = this._tools.get(name);
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
  const errors: string[] = [];
  if (typeof input !== "object" || input === null) {
    errors.push("Input must be an object");
    return errors;
  }

  const required = (schema.required ?? []) as string[];
  const properties = (schema.properties ?? {}) as Record<
    string,
    {
      type?: string;
      enum?: unknown[];
    }
  >;
  const inputObj = input as Record<string, unknown>;

  for (const key of required) {
    if (!(key in inputObj) || inputObj[key] === undefined) {
      errors.push(`Missing required field: "${key}"`);
    }
  }

  for (const [key, value] of Object.entries(inputObj)) {
    const propSchema = properties[key];
    if (!propSchema) continue;

    if (propSchema.type === "string" && typeof value !== "string") {
      errors.push(
        `Field "${key}" must be a string, got ${typeof value}`,
      );
    }
    if (propSchema.type === "number" && typeof value !== "number") {
      errors.push(
        `Field "${key}" must be a number, got ${typeof value}`,
      );
    }
    if (propSchema.type === "boolean" && typeof value !== "boolean") {
      errors.push(
        `Field "${key}" must be a boolean, got ${typeof value}`,
      );
    }
    if (propSchema.enum && !propSchema.enum.includes(value)) {
      errors.push(
        `Field "${key}" must be one of: ${propSchema.enum.join(", ")}`,
      );
    }
  }

  return errors;
}
