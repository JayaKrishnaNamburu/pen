import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

export function createPlanExecutorEditor() {
	return createEditor({
		schema: defaultSchema, preset: noDefaultExtensionsPreset,
	});
}
