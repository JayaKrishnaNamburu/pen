import type { PropSchema } from "@input/pen-types";

export function generateValidator(
	propSchemas: Record<string, PropSchema>,
): (raw: Record<string, unknown>) => Record<string, unknown> {
	return (raw: Record<string, unknown>) => {
		const result: Record<string, unknown> = {};

		for (const [key, schema] of Object.entries(propSchemas)) {
			let value: unknown = raw[key];

			if (value === undefined || value === null) {
				result[key] = schema.default;
				continue;
			}

			const schemaType = Array.isArray(schema.type)
				? schema.type[0]
				: schema.type;

			if (schemaType === "number" && typeof value === "string") {
				const parsed = Number(value);
				if (!Number.isNaN(parsed)) value = parsed;
			}

			if (schemaType === "boolean" && typeof value === "string") {
				value = value === "true";
			}

			// typeof never yields "array", so an array prop needs its own check or
			// every value falls back to the default and the caller loses the data.
			const matchesSchemaType =
				schemaType === "array"
					? Array.isArray(value)
					: typeof value === schemaType;

			if (schema.type && schemaType !== undefined && !matchesSchemaType) {
				result[key] = schema.default;
				continue;
			}

			if (typeof value === "number") {
				if (schema.minimum !== undefined && value < schema.minimum) {
					value = schema.minimum;
				}
				if (
					typeof value === "number" &&
					schema.maximum !== undefined &&
					value > schema.maximum
				) {
					value = schema.maximum;
				}
			}

			if (schema.enum && !(schema.enum as unknown[]).includes(value)) {
				result[key] = schema.default;
				continue;
			}

			result[key] = value;
		}

		return result;
	};
}
