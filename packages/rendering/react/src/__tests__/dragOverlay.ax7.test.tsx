// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { EditorDragOverlay } from "../primitives/editor/dragOverlay";
import {
	BlockDragSessionProvider,
	useBlockDragSession,
} from "../primitives/editor/blockDragSession";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function DragOverlayHarness(props: { asChild?: boolean }): React.ReactElement {
	const { startDrag } = useBlockDragSession();

	return (
		<>
			<button
				type="button"
				data-testid="drag-source"
				onClick={() =>
					startDrag({
						anchorBlockId: "block-a",
						blockIds: ["block-a"],
					})
				}
			>
				Drag
			</button>
			{props.asChild ? (
				<EditorDragOverlay asChild>
					<div data-testid="overlay-preview" style={{ left: "12px" }}>
						Ghost
					</div>
				</EditorDragOverlay>
			) : (
				<EditorDragOverlay>
					<div data-testid="overlay-preview">Ghost</div>
				</EditorDragOverlay>
			)}
		</>
	);
}

async function renderHarness(asChild = false): Promise<{
	container: HTMLDivElement;
	unmount: () => Promise<void>;
}> {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<BlockDragSessionProvider viewId="ax7-drag-overlay">
				<DragOverlayHarness asChild={asChild} />
			</BlockDragSessionProvider>,
		);
	});

	return {
		container,
		unmount: async () => {
			await act(async () => {
				root.unmount();
			});
			container.remove();
		},
	};
}

async function startDrag(container: HTMLElement): Promise<void> {
	const source = container.querySelector(
		"[data-testid='drag-source']",
	) as HTMLButtonElement | null;
	expect(source).not.toBeNull();
	await act(async () => {
		source!.click();
	});
}

describe("AX7 React drag overlay", () => {
	it("AX7 marks overlay chrome aria-hidden with pointer-events none", async () => {
		const view = await renderHarness();

		expect(view.container.querySelector("[data-pen-drag-overlay]")).toBeNull();

		await startDrag(view.container);

		const overlay = view.container.querySelector(
			"[data-pen-drag-overlay]",
		) as HTMLElement | null;
		expect(overlay).not.toBeNull();
		expect(overlay?.getAttribute("aria-hidden")).toBe("true");
		expect(overlay?.style.pointerEvents).toBe("none");

		await view.unmount();
	});

	it("AX7 does not hide the drag source", async () => {
		const view = await renderHarness();
		await startDrag(view.container);

		const source = view.container.querySelector(
			"[data-testid='drag-source']",
		) as HTMLElement | null;
		const overlay = view.container.querySelector(
			"[data-pen-drag-overlay]",
		) as HTMLElement | null;

		expect(source).not.toBeNull();
		expect(overlay).not.toBeNull();
		expect(overlay?.contains(source)).toBe(false);
		expect(source?.getAttribute("aria-hidden")).toBeNull();
		expect(source?.style.pointerEvents).not.toBe("none");

		await view.unmount();
	});

	it("AX7 keeps overlay chrome hidden when rendered asChild", async () => {
		const view = await renderHarness(true);
		await startDrag(view.container);

		const overlay = view.container.querySelector(
			"[data-pen-drag-overlay]",
		) as HTMLElement | null;
		expect(overlay).not.toBeNull();
		expect(overlay?.getAttribute("data-testid")).toBe("overlay-preview");
		expect(overlay?.getAttribute("aria-hidden")).toBe("true");
		expect(overlay?.style.pointerEvents).toBe("none");
		expect(overlay?.style.left).toBe("12px");

		await view.unmount();
	});
});
