import { defineExtension } from "@input/pen-core";
import { describe, expect, it } from "vitest";

import { createDefaultSchema } from "./fixtures/testSchema";
import {
	APPLY_STORM_CODE,
	APPLY_STORM_QUEUE_LIMIT,
	PIPELINE_PHASES,
	createEditor as createCoreEditor,
} from "../index";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createEditor(options: Parameters<typeof createCoreEditor>[0] = {}) {
	return createCoreEditor({
		schema: createDefaultSchema(),
		...options,
		preset: options.preset ?? noDefaultExtensionsPreset,
	});
}

describe("commit pipeline phases (Wave 2.1)", () => {
	it("records the eight named phases in order for a local apply", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const phases: string[] = [];
		const stop = editor.internals.onPipelinePhase((phase) => {
			phases.push(phase);
		});

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "hello",
			},
		]);

		expect(phases).toEqual([...PIPELINE_PHASES]);
		stop();
		editor.destroy();
	});

	it("I7: apply-storm diagnostic trips when an observer feedback loop exceeds queue depth 16", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const codes: string[] = [];
		editor.on("diagnostic", (event) => {
			codes.push(event.code);
		});

		let armed = false;
		editor.on("commit", () => {
			if (!armed) {
				return;
			}
			editor.apply([
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "x",
				},
			]);
		});

		armed = true;
		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "start",
			},
		]);

		expect(codes).toContain(APPLY_STORM_CODE);
		expect(editor.getBlock(blockId)?.textContent().startsWith("x")).toBe(
			true,
		);
		expect(APPLY_STORM_QUEUE_LIMIT).toBe(16);
		editor.destroy();
	});
});
