import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { createTestDocument } from "@input/pen-test";
import { describe, expect, it } from "vitest";

import { MultiplayerControllerImpl } from "../controller";
import { AuthorLedger } from "../presence/authorLedger";
import { ClientIdentityMap } from "../presence/identityMap";
import { mapRemoteSelections } from "../presence/mapRemoteSelection";
import type {
	MultiplayerAwarenessState,
	RemoteTextSelectionState,
} from "../types";

function createDocumentEditor(content = "Hello") {
	const { crdtDoc } = createTestDocument([
		{ id: "b1", type: "paragraph", content },
	]);
	return createEditor({ schema: defaultSchema, document: crdtDoc });
}

function collapsedSelection(
	offset: number,
): Pick<RemoteTextSelectionState, "anchor" | "head"> {
	const point = { blockId: "b1", offset };
	return { anchor: point, head: { ...point } };
}

function visibleText(editor: ReturnType<typeof createDocumentEditor>): string {
	return (editor.getBlock("b1")?.textContent() ?? "").replace(/\u200B/g, "");
}

describe("mapRemoteSelections collapsed carets", () => {
	it("A5: a collapsed remote selection at an insertion stays collapsed", () => {
		const editor = createDocumentEditor();
		const recordedCommitId = editor.summaryLog.latest()?.commitId ?? 0;
		editor.apply(
			[{ type: "insert-text", blockId: "b1", offset: 2, text: "XX" }],
			{ origin: { type: "collaborator" } },
		);
		expect(visibleText(editor)).toBe("HeXXllo");

		const caret = collapsedSelection(2);
		const mapped = mapRemoteSelections(
			editor,
			[
				{
					kind: "text",
					clientId: 77,
					user: { id: "u2", name: "Babbage", unverified: true },
					...caret,
					clock: 11,
				},
			],
			new Map<number, MultiplayerAwarenessState>([
				[
					77,
					{
						selection: {
							kind: "text",
							anchor: caret.anchor,
							head: caret.head,
							clock: 11,
							commitId: recordedCommitId,
						},
					},
				],
			]),
		);

		expect(mapped).toHaveLength(1);
		expect(mapped[0]?.kind).toBe("text");
		if (mapped[0]?.kind !== "text") {
			return;
		}
		expect(mapped[0].anchor).toEqual(mapped[0].head);
		expect(mapped[0].anchor).toEqual({ blockId: "b1", offset: 4 });
		expect(mapped[0].head.offset - mapped[0].anchor.offset).toBe(0);

		editor.destroy();
	});

	it("A5: a collapsed remote selection at a deletion stays collapsed", () => {
		const editor = createDocumentEditor();
		const recordedCommitId = editor.summaryLog.latest()?.commitId ?? 0;
		editor.apply(
			[{ type: "delete-text", blockId: "b1", offset: 1, length: 3 }],
			{ origin: { type: "collaborator" } },
		);
		expect(visibleText(editor)).toBe("Ho");

		const caret = collapsedSelection(2);
		const mapped = mapRemoteSelections(
			editor,
			[
				{
					kind: "text",
					clientId: 77,
					user: { id: "u2", name: "Babbage", unverified: true },
					...caret,
					clock: 11,
				},
			],
			new Map<number, MultiplayerAwarenessState>([
				[
					77,
					{
						selection: {
							kind: "text",
							anchor: caret.anchor,
							head: caret.head,
							clock: 11,
							commitId: recordedCommitId,
						},
					},
				],
			]),
		);

		expect(mapped[0]?.kind).toBe("text");
		if (mapped[0]?.kind !== "text") {
			return;
		}
		expect(mapped[0].anchor).toEqual(mapped[0].head);
		expect(mapped[0].anchor.offset).toBe(mapped[0].head.offset);

		editor.destroy();
	});

	it("A5: controller state keeps a stale collapsed caret collapsed after a local insert", () => {
		const editor = createDocumentEditor();
		const recordedCommitId = editor.summaryLog.latest()?.commitId ?? 0;
		editor.apply(
			[{ type: "insert-text", blockId: "b1", offset: 2, text: "XX" }],
			{ origin: { type: "collaborator" } },
		);
		expect(visibleText(editor)).toBe("HeXXllo");

		const controller = new MultiplayerControllerImpl({
			editor,
			config: { user: { id: "u1", name: "Ada" } },
			authorLedger: new AuthorLedger(),
			identityMap: new ClientIdentityMap(),
		});

		controller.handleAwarenessChange(
			new Map<number, MultiplayerAwarenessState>([
				[editor.clientId, { user: { id: "u1", name: "Ada" } }],
				[
					77,
					{
						user: { id: "u2", name: "Babbage", color: "#abc123" },
						cursor: {
							blockId: "b1",
							offset: 2,
							clock: 10,
							commitId: recordedCommitId,
						},
						selection: {
							kind: "text",
							anchor: { blockId: "b1", offset: 2 },
							head: { blockId: "b1", offset: 2 },
							clock: 11,
							commitId: recordedCommitId,
						},
					},
				],
			]),
		);

		const [selection] = controller.getRemoteSelections();
		expect(selection?.kind).toBe("text");
		if (selection?.kind !== "text") {
			editor.destroy();
			return;
		}
		expect(selection.anchor).toEqual(selection.head);
		expect(selection.anchor).toEqual({ blockId: "b1", offset: 4 });
		expect(controller.getRemoteCursors()[0]?.offset).toBe(4);

		editor.destroy();
	});
});
