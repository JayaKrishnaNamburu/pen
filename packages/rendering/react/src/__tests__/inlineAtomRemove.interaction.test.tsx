// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen";
import { createDefaultSchema } from "@input/pen-schema";
import { DATA_ATTRS } from "@input/pen-dom/utils/dataAttributes";
import { Pen } from "../primitives/index";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function flushAnimationFrames(count = 1): Promise<void> {
	for (let i = 0; i < count; i++) {
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => resolve());
		});
	}
}

function createPresetEditor() {
	return createEditor({
		schema: createDefaultSchema(),
		preset: defaultPreset({
			tools: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

describe("inline atom renderer remove", () => {
	it("removes the atom through interaction.remove without a host delta walk", async () => {
		const editor = createPresetEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "A" },
			{
				type: "splice-text",
				blockId,
				from: 1,
				to: 1,
				insert: {
					nodeType: "mention",
					props: { id: "user-1", label: "Ada" },
				},
			},
			{ type: "splice-text", blockId, from: 2, to: 2, insert: "B" },
		]);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		try {
			await act(async () => {
				root.render(
					<Pen.Editor.Root
						editor={editor}
						inlineAtomRenderers={{
							mention: ({ interaction }) => (
								<button
									type="button"
									data-testid="mention-remove"
									onClick={() => interaction?.remove?.()}
								>
									remove
								</button>
							),
						}}
					>
						<Pen.Editor.Content />
					</Pen.Editor.Root>,
				);
				await flushAnimationFrames(2);
			});

			const button = container.querySelector(
				"[data-testid='mention-remove']",
			) as HTMLButtonElement | null;
			expect(button).not.toBeNull();
			expect(
				container.querySelector(`[${DATA_ATTRS.inlineAtom}]`),
			).not.toBeNull();

			await act(async () => {
				button!.click();
				await flushAnimationFrames(2);
			});

			expect(editor.getBlock(blockId)?.inlineDeltas()).toEqual([
				{ insert: "AB" },
			]);
			expect(
				container.querySelector(`[${DATA_ATTRS.inlineAtom}]`),
			).toBeNull();
		} finally {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		}
	});
});
