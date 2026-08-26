// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import type { Editor } from "@input/pen-types";
import { useEditor } from "../hooks/useEditor";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function isDestroyed(editor: Editor): boolean {
	return (editor as unknown as { _isDestroyed: boolean })._isDestroyed;
}

function presetOptions() {
	return {
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	};
}

/** Collects the editor returned by every render pass of a probe component. */
function renderProbe(): {
	seen: Editor[];
	root: Root;
	unmount: () => Promise<void>;
} {
	const seen: Editor[] = [];
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);

	return {
		seen,
		root,
		unmount: async () => {
			await act(async () => {
				root.unmount();
			});
			container.remove();
		},
	};
}

describe("useEditor", () => {
	it("returns a live editor after a StrictMode double-mount", async () => {
		const probe = renderProbe();

		function Owned() {
			const editor = useEditor(presetOptions());
			probe.seen.push(editor);
			return null;
		}

		await act(async () => {
			probe.root.render(
				<StrictMode>
					<Owned />
				</StrictMode>,
			);
		});

		const current = probe.seen.at(-1);
		expect(current).toBeDefined();
		expect(isDestroyed(current as Editor)).toBe(false);

		await probe.unmount();
	});

	it("destroys the editor it owns on unmount", async () => {
		const probe = renderProbe();

		function Owned() {
			const editor = useEditor(presetOptions());
			probe.seen.push(editor);
			return null;
		}

		await act(async () => {
			probe.root.render(<Owned />);
		});

		const current = probe.seen.at(-1) as Editor;
		expect(isDestroyed(current)).toBe(false);

		await probe.unmount();
		expect(isDestroyed(current)).toBe(true);
	});

	it("leaves an externally owned editor alone through StrictMode and unmount", async () => {
		const external = createEditor(presetOptions());
		const probe = renderProbe();

		function Borrowed() {
			const editor = useEditor(external);
			probe.seen.push(editor);
			return null;
		}

		await act(async () => {
			probe.root.render(
				<StrictMode>
					<Borrowed />
				</StrictMode>,
			);
		});

		expect(new Set(probe.seen)).toEqual(new Set([external]));
		expect(isDestroyed(external)).toBe(false);

		await probe.unmount();
		expect(isDestroyed(external)).toBe(false);

		await external.destroy();
	});
});
