// @vitest-environment jsdom

import type { CellSelection, DiagnosticEvent, Editor } from "@input/pen-types";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pasteCellSelection } from "../utils/tableCellClipboard";

function stubEditor(onDiagnostic: (event: DiagnosticEvent) => void): Editor {
	return {
		internals: {
			emit(event: string, payload: unknown) {
				if (event === "diagnostic") {
					onDiagnostic(payload as DiagnosticEvent);
				}
			},
		},
	} as Editor;
}

const cellSelection = {
	type: "cell",
	blockId: "table-1",
	anchor: { row: 0, col: 0 },
	head: { row: 0, col: 0 },
} as CellSelection;

describe("table cell clipboard (CH5)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("CH5: emits a diagnostic when clipboard.readText rejects", async () => {
		const diagnostics: DiagnosticEvent[] = [];
		vi.stubGlobal("navigator", {
			clipboard: {
				read: () => Promise.reject(new Error("denied")),
				readText: () => Promise.reject(new Error("denied")),
			},
		});

		pasteCellSelection(
			stubEditor((event) => diagnostics.push(event)),
			cellSelection,
		);

		await vi.waitFor(() => {
			expect(diagnostics).toHaveLength(1);
		});
		expect(diagnostics[0]).toEqual(
			expect.objectContaining({
				code: "PEN_CLIPBOARD_001",
				level: "warn",
				source: "clipboard",
				remediation: expect.any(String),
			}),
		);
	});
});
