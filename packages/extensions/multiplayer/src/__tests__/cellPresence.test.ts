import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import { createTestDocument } from "@input/pen-test";
import type { Editor } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import { MultiplayerControllerImpl } from "../controller";
import { buildRemoteSelectionDecorations } from "../decorations/remoteSelections";
import { multiplayerExtension } from "../index";
import { AuthorLedger } from "../presence/authorLedger";
import { ClientIdentityMap } from "../presence/identityMap";
import type {
	MultiplayerAwarenessState,
	MultiplayerCellCoord,
	RemoteSelectionState,
} from "../types";

const TABLE_ID = "table-1";
const PEER_ID = 77;
const PEER_USER = { id: "u2", name: "Babbage", color: "#abc123" };
const RESOLVED_PEER_USER = { ...PEER_USER, unverified: true as const };

/**
 * Default seeded grid is 2x2, so rows and cols are both 0..1.
 *
 * Deliberately not `createTestEditor`: that harness makes `getBlock` throw on a
 * missing block, which hides the `null` the real contract returns once a table
 * is deleted under a held selection.
 */
function createTableEditor(options?: { collaborative?: boolean }) {
	const { crdtDoc } = createTestDocument([
		{ id: TABLE_ID, type: "table", props: {} },
	]);
	return createEditor({
		schema: defaultSchema,
		document: crdtDoc,
		extensions: options?.collaborative
			? [multiplayerExtension({ user: { id: "u1", name: "Ada" } })]
			: [],
	});
}

function createController(editor: Editor) {
	return new MultiplayerControllerImpl({
		editor,
		config: { user: { id: "u1", name: "Ada" } },
		authorLedger: new AuthorLedger(),
		identityMap: new ClientIdentityMap(),
	});
}

function sendCellSelection(
	controller: MultiplayerControllerImpl,
	anchor: MultiplayerCellCoord,
	head: MultiplayerCellCoord,
	blockId = TABLE_ID,
) {
	controller.handleAwarenessChange(
		new Map<number, MultiplayerAwarenessState>([
			[
				PEER_ID,
				{
					user: PEER_USER,
					selection: {
						kind: "cell",
						blockId,
						anchor,
						head,
						clock: 12,
					},
				},
			],
		]),
	);
}

describe("local cell presence", () => {
	it("publishes the occupied cell and no cursor", () => {
		const editor = createTableEditor({ collaborative: true });

		editor.selectCell(TABLE_ID, 1, 0);

		const local = editor.internals.awareness?.getLocalState() as
			MultiplayerAwarenessState | undefined;
		expect(local?.cursor).toBeNull();
		expect(local?.selection).toMatchObject({
			kind: "cell",
			blockId: TABLE_ID,
			anchor: { row: 1, col: 0 },
			head: { row: 1, col: 0 },
		});
	});

	it("publishes the whole range for a multi-cell selection", () => {
		const editor = createTableEditor({ collaborative: true });

		editor.selectCellRange(
			TABLE_ID,
			{ row: 0, col: 0 },
			{ row: 1, col: 1 },
		);

		const local = editor.internals.awareness?.getLocalState() as
			MultiplayerAwarenessState | undefined;
		expect(local?.selection).toMatchObject({
			kind: "cell",
			blockId: TABLE_ID,
			anchor: { row: 0, col: 0 },
			head: { row: 1, col: 1 },
		});
	});
});

describe("remote cell presence", () => {
	it("resolves a cell payload into a cell selection", () => {
		const editor = createTableEditor();
		const controller = createController(editor);

		sendCellSelection(controller, { row: 0, col: 0 }, { row: 1, col: 1 });

		expect(controller.getRemoteSelections()).toEqual([
			{
				kind: "cell",
				clientId: PEER_ID,
				user: RESOLVED_PEER_USER,
				blockId: TABLE_ID,
				anchor: { row: 0, col: 0 },
				head: { row: 1, col: 1 },
				clock: 12,
			},
		]);
	});

	it("clamps a held selection into the grid a commit shrank", () => {
		const editor = createTableEditor();
		const controller = createController(editor);
		sendCellSelection(controller, { row: 1, col: 1 }, { row: 1, col: 1 });

		editor.apply(
			[
				{
					type: "grid",
					blockId: TABLE_ID,
					change: { kind: "delete-row", index: 1 },
				},
			],
			{ origin: "user" },
		);

		expect(controller.getRemoteSelections()).toEqual([
			expect.objectContaining({
				kind: "cell",
				anchor: { row: 0, col: 1 },
				head: { row: 0, col: 1 },
			}),
		]);
	});

	it("drops the peer when the table is deleted", () => {
		const editor = createTableEditor();
		const controller = createController(editor);
		sendCellSelection(controller, { row: 0, col: 0 }, { row: 0, col: 0 });
		expect(controller.getRemoteSelections()).toHaveLength(1);

		editor.apply([{ type: "delete-block", blockId: TABLE_ID }], {
			origin: "user",
		});

		expect(controller.getRemoteSelections()).toEqual([]);
	});

	it("emits no decorations, leaving the paint to the table renderer", () => {
		const editor = createTableEditor();
		const selection: RemoteSelectionState = {
			kind: "cell",
			clientId: PEER_ID,
			user: RESOLVED_PEER_USER,
			blockId: TABLE_ID,
			anchor: { row: 0, col: 0 },
			head: { row: 1, col: 1 },
			clock: 12,
		};

		expect(buildRemoteSelectionDecorations(editor, [selection])).toEqual(
			[],
		);
	});
});
