import type { PropSchema } from "./types/schema";

class PropChainImpl {
  private _schema: Record<string, unknown>;

  constructor(init: Record<string, unknown>) {
    this._schema = { ...init };
  }

  default(value: unknown): this {
    this._schema.default = value;
    return this;
  }

  describe(text: string): this {
    this._schema.description = text;
    return this;
  }

  min(value: number): this {
    this._schema.minimum = value;
    return this;
  }

  max(value: number): this {
    this._schema.maximum = value;
    return this;
  }

  optional(): PropChainImpl {
    const currentType = this._schema.type;
    this._schema.type = currentType ? [currentType, "null"] : "null";
    return this;
  }

  toSchema(): PropSchema {
    return { ...this._schema } as PropSchema;
  }

  toJSON(): Record<string, unknown> {
    return { ...this._schema };
  }
}

export function resolveSchema(value: unknown): PropSchema {
  if (value instanceof PropChainImpl) {
    return value.toSchema();
  }
  return value as PropSchema;
}

function computeDefaults(
  properties: Record<string, PropSchema>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(properties)) {
    if (schema.default !== undefined) {
      defaults[key] = schema.default;
    }
  }
  return defaults;
}

export const prop = {
  string() {
    return new PropChainImpl({ type: "string", default: "" });
  },
  number() {
    return new PropChainImpl({ type: "number", default: 0 });
  },
  boolean() {
    return new PropChainImpl({ type: "boolean", default: false });
  },
  enum(values: readonly (string | number)[]) {
    const inferredType =
      values.length > 0 && typeof values[0] === "number" ? "number" : "string";
    return new PropChainImpl({
      type: inferredType,
      default: values[0],
      enum: [...values],
    });
  },
  array(items: PropChainImpl | PropSchema) {
    return new PropChainImpl({
      type: "array",
      default: [],
      items: resolveSchema(items),
    });
  },
  object(properties: Record<string, PropChainImpl | PropSchema>) {
    const resolved: Record<string, PropSchema> = {};
    for (const [k, v] of Object.entries(properties)) {
      resolved[k] = resolveSchema(v);
    }
    return new PropChainImpl({
      type: "object",
      default: computeDefaults(resolved),
      properties: resolved,
    });
  },
  json() {
    return new PropChainImpl({});
  },
  optional(inner: PropChainImpl): PropChainImpl {
    return inner.optional();
  },
};
