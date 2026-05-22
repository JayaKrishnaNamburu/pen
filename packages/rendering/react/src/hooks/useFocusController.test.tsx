// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { createEditor } from "@pen/core";
import { defaultPreset } from "@pen/preset-default";
import type { Editor } from "@pen/types";
import type { PenFocusPolicy } from "@pen/dom";
import { DATA_ATTRS } from "../utils/dataAttributes";
import { Pen } from "../primitives/index";
import {
	useFocusController,
	type PenFocusController,
} from "./useFocusController";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createPresetEditor() {
	return createEditor({
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

async function flushAnimationFrames(count = 1): Promise<void> {
	for (let i = 0; i < count; i++) {
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => resolve());
		});
	}
}

function FocusProbe({
	editor,
	onReady,
}: {
	editor: Editor;
	onReady: (controller: PenFocusController) => void;
}) {
	const controller = Pen.useFocusController(editor);
	useEffect(() => {
		onReady(controller);
	}, [controller, onReady]);
	return null;
}

async function renderEditor({
	editor,
	focusPolicy,
	onReady,
}: {
	editor: Editor;
	focusPolicy?: PenFocusPolicy;
	onReady: (controller: PenFocusController) => void;
}) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<Pen.Editor.Root
				editor={editor}
				focusPolicy={focusPolicy}
			>
				<FocusProbe
					editor={editor}
					onReady={onReady}
				/>
				<Pen.Editor.Content />
			</Pen.Editor.Root>,
		);
		await flushAnimationFrames(3);
	});

	return {
		container,
		root,
		cleanup: () => {
			root.unmount();
			container.remove();
			editor.destroy();
		},
	};
}

describe("useFocusController", () => {
	it("focuses a text selection when policy allows DOM focus", async () => {
		const editor = createPresetEditor();
		const blockId = editor.firstBlock()!.id;
		let controller: PenFocusController | undefined;
		const rendered = await renderEditor({
			editor,
			onReady: (nextController) => {
				controller = nextController;
			},
		});
		const inline = rendered.container.querySelector(
			`[${DATA_ATTRS.inlineContent}]`,
		) as HTMLElement;
		const focusSpy = vi.spyOn(inline, "focus");

		try {
			let didFocus = false;
			await act(async () => {
				didFocus = await controller!.end(blockId, {
					reason: "programmatic",
				});
			});

			expect(didFocus).toBe(true);
			expect(focusSpy).toHaveBeenCalled();
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 0 },
				focus: { blockId, offset: 0 },
			});
		} finally {
			rendered.cleanup();
		}
	});

	it("returns false when policy denies focus", async () => {
		const editor = createPresetEditor();
		const blockId = editor.firstBlock()!.id;
		let controller: PenFocusController | undefined;
		const focusPolicy: PenFocusPolicy = {
			decide: () => ({ type: "deny" }),
		};
		const rendered = await renderEditor({
			editor,
			focusPolicy,
			onReady: (nextController) => {
				controller = nextController;
			},
		});

		try {
			let didFocus = true;
			await act(async () => {
				didFocus = await controller!.end(blockId, {
					reason: "programmatic",
				});
			});

			expect(didFocus).toBe(false);
		} finally {
			rendered.cleanup();
		}
	});

	it("projects passive selections without DOM focus", async () => {
		const editor = createPresetEditor();
		const blockId = editor.firstBlock()!.id;
		let controller: PenFocusController | undefined;
		const decide = vi.fn(() => ({ type: "allow" as const }));
		const rendered = await renderEditor({
			editor,
			focusPolicy: { decide },
			onReady: (nextController) => {
				controller = nextController;
			},
		});
		const inline = rendered.container.querySelector(
			`[${DATA_ATTRS.inlineContent}]`,
		) as HTMLElement;
		const focusSpy = vi.spyOn(inline, "focus");

		try {
			let didProject = false;
			await act(async () => {
				didProject = await controller!.range({
					blockId,
					anchorOffset: 0,
					focusOffset: 0,
					domFocus: false,
					reason: "programmatic",
				});
				await flushAnimationFrames(2);
			});

			expect(didProject).toBe(true);
			expect(focusSpy).not.toHaveBeenCalled();
			const requests = decide.mock.calls as unknown as Array<
				Parameters<PenFocusPolicy["decide"]>
			>;
			expect(requests.some(([request]) => request.passive === true)).toBe(
				true,
			);
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 0 },
				focus: { blockId, offset: 0 },
			});
		} finally {
			rendered.cleanup();
		}
	});

	it("returns false when no field editor is attached", async () => {
		const editor = createPresetEditor();
		const blockId = editor.firstBlock()!.id;
		const controller = useFocusController(editor);

		try {
			await expect(controller.end(blockId)).resolves.toBe(false);
		} finally {
			editor.destroy();
		}
	});

	it("restores a previously captured range", async () => {
		const editor = createPresetEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "Hello",
			},
		]);
		let controller: PenFocusController | undefined;
		const rendered = await renderEditor({
			editor,
			onReady: (nextController) => {
				controller = nextController;
			},
		});

		try {
			let didRestore = false;
			await act(async () => {
				didRestore = await controller!.restore({
					blockId,
					anchorOffset: 1,
					focusOffset: 4,
					reason: "programmatic",
				});
			});

			expect(didRestore).toBe(true);
			expect(editor.selection).toMatchObject({
				type: "text",
				anchor: { blockId, offset: 1 },
				focus: { blockId, offset: 4 },
			});
		} finally {
			rendered.cleanup();
		}
	});
});
