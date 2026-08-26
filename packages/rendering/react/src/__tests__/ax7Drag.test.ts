// @vitest-environment jsdom

import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { EditorDragOverlay } from "../primitives/editor/dragOverlay";
import {
	BlockDragSessionProvider,
	useBlockDragSession,
} from "../primitives/editor/blockDragSession";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function DragOverlayHarness(props: { asChild?: boolean }) {
	const { startDrag } = useBlockDragSession();
	const source = createElement(
		"button",
		{
			type: "button",
			"data-testid": "drag-source",
			onClick: () =>
				startDrag({
					anchorBlockId: "block-a",
					blockIds: ["block-a"],
				}),
		},
		"Drag",
	);
	const preview = createElement(
		"div",
		{
			"data-testid": "overlay-preview",
			style: props.asChild ? { left: "12px" } : undefined,
		},
		"Ghost",
	);
	const overlay = props.asChild
		? createElement(EditorDragOverlay, { asChild: true }, preview)
		: createElement(EditorDragOverlay, null, preview);

	return createElement(Fragment, null, source, overlay);
}

const fixtures: Array<{
	container: HTMLDivElement;
	root: ReturnType<typeof createRoot>;
}> = [];

async function renderHarness(asChild = false) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	await act(async () => {
		root.render(
			createElement(BlockDragSessionProvider, {
				viewId: "ax7-drag-overlay",
				children: createElement(DragOverlayHarness, { asChild }),
			}),
		);
	});

	const fixture = { container, root };
	fixtures.push(fixture);
	return fixture;
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

afterEach(async () => {
	while (fixtures.length > 0) {
		const fixture = fixtures.pop();
		if (!fixture) {
			break;
		}
		await act(async () => {
			fixture.root.unmount();
		});
		fixture.container.remove();
	}
});

describe("AX7 React drag overlay", () => {
	it("AX7 marks overlay chrome aria-hidden with pointer-events none", async () => {
		const view = await renderHarness();

		expect(
			view.container.querySelector("[data-pen-drag-overlay]"),
		).toBeNull();

		await startDrag(view.container);

		const overlay = view.container.querySelector(
			"[data-pen-drag-overlay]",
		) as HTMLElement | null;
		expect(overlay).not.toBeNull();
		expect(overlay?.getAttribute("aria-hidden")).toBe("true");
		expect(overlay?.style.pointerEvents).toBe("none");
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
	});
});
