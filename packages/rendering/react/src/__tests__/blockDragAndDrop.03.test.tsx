// @vitest-environment jsdom

import React, { act, type Ref } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor } from "@pen/core";
import type { BlockHandle, BlockRenderContext, Editor } from "@pen/types";
import { generateId } from "@pen/types";
import { defaultPreset } from "@pen/preset-default";
import { Pen } from "../primitives/index";
import type { BlockControlsProps } from "../context/editorContext";
import { useBlockDragHandle } from "../hooks/useBlockDragHandle";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type TestRenderResult = {
	container: HTMLDivElement;
	root: ReturnType<typeof createRoot>;
	unmount: () => Promise<void>;
};

type MockDataTransfer = DataTransfer & {
	effectAllowed: string;
	dropEffect: string;
	setDragImageMock: ReturnType<typeof vi.fn>;
};

function createDataTransfer(): MockDataTransfer {
	const data = new Map<string, string>();
	const types: string[] = [];
	const setDragImage = vi.fn();

	return {
		effectAllowed: "",
		dropEffect: "",
		types,
		setDragImage,
		setDragImageMock: setDragImage,
		files: [] as unknown as FileList,
		getData(type: string) {
			return data.get(type) ?? "";
		},
		setData(type: string, value: string) {
			data.set(type, value);
			if (!types.includes(type)) {
				types.push(type);
			}
		},
		clearData(type?: string) {
			if (type) {
				data.delete(type);
				const index = types.indexOf(type);
				if (index >= 0) {
					types.splice(index, 1);
				}
				return;
			}
			data.clear();
			types.splice(0, types.length);
		},
	} as unknown as MockDataTransfer;
}

function createDragEvent(
	type: "dragstart" | "dragover" | "drop" | "dragend",
	dataTransfer: MockDataTransfer,
	coords: { clientX?: number; clientY?: number } = {},
): MouseEvent & { dataTransfer: DataTransfer } {
	const event = new MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX: coords.clientX ?? 20,
		clientY: coords.clientY ?? 20,
	}) as MouseEvent & { dataTransfer: DataTransfer };

	Object.defineProperty(event, "dataTransfer", {
		value: dataTransfer,
	});

	return event;
}

function getBlockOrder(editor: Editor): string[] {
	return [...editor.documentState.blockOrder];
}

function seedBlocks(editor: Editor, count: number): string[] {
	const ids = [editor.firstBlock()!.id];

	for (let index = 1; index < count; index += 1) {
		const blockId = generateId();
		editor.apply([
			{
				type: "insert-block",
				blockId,
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		ids.push(blockId);
	}

	return ids;
}

async function renderEditor(element: React.ReactElement): Promise<TestRenderResult> {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	await act(async () => {
		root.render(element);
	});

	return {
		container,
		root,
		unmount: async () => {
			await act(async () => {
				root.unmount();
			});
			container.remove();
		},
	};
}

function createBlockDragEditor(
	options: Parameters<typeof createEditor>[0] = {},
) {
	return createEditor({
		...options,
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

function setBlockRect(
	container: HTMLElement,
	blockId: string,
	rect: { top: number; height?: number },
): HTMLElement {
	const element = container.querySelector(
		`[data-block-id="${blockId}"]`,
	) as HTMLElement | null;
	if (!element) {
		throw new Error(`Missing block element for ${blockId}`);
	}

	const height = rect.height ?? 40;
	element.getBoundingClientRect = () =>
		({
			top: rect.top,
			bottom: rect.top + height,
			height,
			left: 0,
			right: 300,
			width: 300,
			x: 0,
			y: rect.top,
			toJSON() {
				return {};
			},
		}) as DOMRect;

	return element;
}

function CustomHandleParagraphRenderer(
	block: BlockHandle,
	ctx: BlockRenderContext,
): React.ReactElement {
	return <CustomHandleParagraph blockId={block.id} ctx={ctx} />;
}

function CustomHandleParagraph(props: {
	blockId: string;
	ctx: BlockRenderContext;
}): React.ReactElement {
	const { blockId, ctx } = props;
	const { props: dragProps } = useBlockDragHandle(blockId);

	return (
		<div
			ref={ctx.ref as Ref<HTMLDivElement>}
			data-block-type="paragraph"
			data-selected={ctx.selected || undefined}
		>
			<button {...dragProps} data-testid={`custom-handle-${blockId}`}>
				Drag
			</button>
			<div data-pen-inline-content="">Paragraph</div>
		</div>
	);
}

function GlobalHandle(props: BlockControlsProps): React.ReactElement {
	const { blockId } = props;
	const { props: dragProps } = useBlockDragHandle(blockId);

	return (
		<button {...dragProps} data-testid={`global-handle-${blockId}`}>
			Drag
		</button>
	);
}

describe("@pen/react block drag and drop", () => {
	it("does not auto-enable handle drag in flow mode when block-first interaction is enabled", async () => {
		const editor = createBlockDragEditor({
			editorViewMode: "flow",
		});
		const [blockA] = seedBlocks(editor, 1);

		const view = await renderEditor(
			<Pen.Editor.Root
				editor={editor}
				interactionModel="block-first"
				renderers={{ paragraph: CustomHandleParagraphRenderer }}
			>
				<Pen.Editor.Content />
			</Pen.Editor.Root>,
		);

		const handle = view.container.querySelector(
			`[data-testid="custom-handle-${blockA}"]`,
		) as HTMLElement | null;
		expect(handle).not.toBeNull();
		expect(handle?.getAttribute("draggable")).toBe("false");

		await view.unmount();
	});

	it("disables drag behavior when block drag and drop is disabled", async () => {
		const editor = createBlockDragEditor();
		const [blockA, blockB] = seedBlocks(editor, 2);

		const view = await renderEditor(
			<Pen.Editor.Root
				editor={editor}
				blockDragAndDrop={{ enabled: false }}
				renderers={{ paragraph: CustomHandleParagraphRenderer }}
			>
				<Pen.Editor.Content />
			</Pen.Editor.Root>,
		);

		const customHandle = view.container.querySelector(
			`[data-testid="custom-handle-${blockB}"]`,
		) as HTMLElement | null;
		expect(customHandle).not.toBeNull();
		expect(customHandle?.getAttribute("draggable")).toBe("false");

		const targetBlock = setBlockRect(view.container, blockA, { top: 0 });
		const dataTransfer = createDataTransfer();

		await act(async () => {
			customHandle!.dispatchEvent(createDragEvent("dragstart", dataTransfer));
			targetBlock.dispatchEvent(
				createDragEvent("dragover", dataTransfer, { clientY: 1 }),
			);
			targetBlock.dispatchEvent(
				createDragEvent("drop", dataTransfer, { clientY: 1 }),
			);
		});

		expect(getBlockOrder(editor)).toEqual([blockA, blockB]);

		await view.unmount();
	});

});
