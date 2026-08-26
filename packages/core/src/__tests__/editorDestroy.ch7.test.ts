import { defineExtension } from "@input/pen-core";
import { describe, expect, it } from "vitest";

import { createDefaultSchema } from "./fixtures/testSchema";
import { createEditor as createCoreEditor } from "../index";

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

describe("editor destroy teardown", () => {
	it("CH7 F21: destroy returns the queued teardown promise", async () => {
		let deactivated = false;
		const editor = createEditor({
			extensions: [
				defineExtension({
					name: "teardown-probe",
					deactivateClient: async () => {
						await Promise.resolve();
						deactivated = true;
					},
				}),
			],
		});

		await editor.whenReady();
		const teardown = editor.destroy();
		expect(deactivated).toBe(false);
		await teardown;
		expect(deactivated).toBe(true);
	});

	it("CH7 F21: destroy clears block revisions", async () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "splice-text", blockId, from: 0, to: 0, insert: "x" }],
			{ origin: "user" },
		);

		expect(editor.getBlockRevision(blockId)).toBeGreaterThan(0);
		await editor.destroy();
		expect(editor.getBlockRevision(blockId)).toBe(0);
	});

	it("CH7 F21: destroy is idempotent and returns the same teardown", async () => {
		const editor = createEditor();
		await editor.whenReady();

		const first = editor.destroy();
		const second = editor.destroy();
		expect(second).toBe(first);
		await first;
	});
});
