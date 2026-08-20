import type { CreateEditorOptions, SchemaRegistry } from "@input/pen-types";
import { SchemaRegistryImpl } from "./registry";

/** Empty registry for hosts that do not pass `schema` or a preset that provides one. */
export function createEmptySchema(): SchemaRegistryImpl {
	return new SchemaRegistryImpl({
		blocks: [],
		inlines: [],
		onUnknownBlock: () => "passthrough",
	});
}

export function resolveEditorSchema(
	options: CreateEditorOptions = {},
): SchemaRegistry {
	if (options.schema) {
		return options.schema;
	}
	if (options.preset) {
		const peeked = options.preset.resolve({
			schema: createEmptySchema(),
			documentProfile: options.documentProfile ?? "flow",
		});
		if (peeked.schema) {
			return peeked.schema;
		}
	}
	return createEmptySchema();
}
