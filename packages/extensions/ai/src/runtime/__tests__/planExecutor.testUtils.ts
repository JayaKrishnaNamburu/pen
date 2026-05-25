import { createEditor } from "@pen/core";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

export function createPlanExecutorEditor() {
	return createEditor({
		preset: noDefaultExtensionsPreset,
	});
}
