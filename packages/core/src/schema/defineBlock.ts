import type { BlockA11ySpec } from "@input/pen-types";
import type {
	BlockSchema,
	ContentType,
	PropSchema,
} from "@input/pen-types";
import { resolveSchema } from "./prop";

type DefineBlockConfig = Omit<
	Partial<BlockSchema<string, Record<string, PropSchema>, ContentType>>,
	"type" | "propSchema" | "validateProps"
> & {
	props?: Record<string, unknown>;
	propSchema?: Record<string, unknown>;
	aiDescription?: string;
};

function resolveProps(
	config: DefineBlockConfig,
): Record<string, PropSchema> {
	const raw = config.props ?? config.propSchema ?? {};
	const resolved: Record<string, PropSchema> = {};
	for (const [k, v] of Object.entries(raw)) {
		resolved[k] = resolveSchema(v);
	}
	return resolved;
}

function typeNameToTitle(type: string): string {
	const spaced = type.replace(/([a-z])([A-Z])/g, "$1 $2");
	return spaced
		.split(/[\s\-_]+/)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

function generateAIDescription(
	type: string,
	props: Record<string, PropSchema>,
): string {
	const propEntries = Object.entries(props);
	if (propEntries.length === 0) return type;
	const propDescriptions = propEntries
		.map(([name, schema]) => {
			const desc = schema.description ? ` (${schema.description})` : "";
			return `${name}${desc}`;
		})
		.join(", ");
	return `${type}: ${propDescriptions}`;
}

function generateValidator(
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
				if (typeof value === "number" && schema.maximum !== undefined && value > schema.maximum) {
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

export type DefinedBlockSchema<
	Type extends string = string,
> = Omit<
	BlockSchema<Type, Record<string, PropSchema>, ContentType>,
	"a11y"
> & {
	a11y(
		spec: BlockA11ySpec,
	): BlockSchema<Type, Record<string, PropSchema>, ContentType>;
};

export function defineBlock<Type extends string>(
	type: Type,
	config: DefineBlockConfig,
): DefinedBlockSchema<Type>;
export function defineBlock<Type extends string>(
	config: DefineBlockConfig & { type: Type },
): DefinedBlockSchema<Type>;
export function defineBlock<Type extends string>(
	typeOrConfig: Type | (DefineBlockConfig & { type: Type }),
	maybeConfig?: DefineBlockConfig,
): DefinedBlockSchema<Type> {
	const type = (
		typeof typeOrConfig === "string" ? typeOrConfig : typeOrConfig.type
	) as Type;
	const config =
		typeof typeOrConfig === "string" ? maybeConfig! : typeOrConfig;
	const props = resolveProps(config);

	const schema = {
		type,
		propSchema: props,
		content: (config.content ?? "inline") as ContentType,
		layout: config.layout,
		serialize: config.serialize ?? {},
		normalize: config.normalize,
		validateProps:
			Object.keys(props).length > 0 ? generateValidator(props) : undefined,
		fieldEditor: config.fieldEditor,
		keyBindings: config.keyBindings,
		placeholder: config.placeholder,
		display: config.display ?? { title: typeNameToTitle(type) },
		authoring: config.authoring,
		isContainer: config.isContainer,
		aiDescription: config.aiDescription ?? generateAIDescription(type, props),
	} as BlockSchema<Type, Record<string, PropSchema>, ContentType>;
	if (config.a11y) {
		schema.a11y = freezeA11ySpec(config.a11y);
	}
	return withA11yBuilder(schema);
}

function freezeA11ySpec<Props>(
	spec: BlockA11ySpec<Props>,
): BlockA11ySpec<Props> {
	const copy: BlockA11ySpec<Props> = { label: spec.label };
	if (spec.roleDescription !== undefined) {
		copy.roleDescription = spec.roleDescription;
	}
	return Object.freeze(copy);
}

function withA11yBuilder<Type extends string>(
	schema: BlockSchema<Type, Record<string, PropSchema>, ContentType>,
): DefinedBlockSchema<Type> {
	if (schema.a11y === undefined) {
		Object.defineProperty(schema, "a11y", {
			configurable: true,
			enumerable: false,
			value: (spec: BlockA11ySpec) => ({
				...schema,
				a11y: freezeA11ySpec(spec),
			}),
		});
	}
	return schema as unknown as DefinedBlockSchema<Type>;
}
