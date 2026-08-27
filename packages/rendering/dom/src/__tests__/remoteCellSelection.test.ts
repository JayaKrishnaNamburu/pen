import { describe, expect, it } from "vitest";
import {
	resolveRemoteCellPresence,
	type RemoteCellSelectionLike,
} from "../utils/remoteCellSelection";

const TABLE_ID = "table-1";

function cellSelection(
	overrides: Partial<RemoteCellSelectionLike> = {},
): RemoteCellSelectionLike {
	return {
		kind: "cell",
		clientId: 77,
		user: { id: "u2", name: "Babbage", color: "#abc123" },
		blockId: TABLE_ID,
		anchor: { row: 0, col: 0 },
		head: { row: 0, col: 0 },
		clock: 10,
		...overrides,
	};
}

describe("resolveRemoteCellPresence", () => {
	it("claims every cell of the range and marks only the head", () => {
		const presence = resolveRemoteCellPresence(
			[
				cellSelection({
					anchor: { row: 0, col: 0 },
					head: { row: 1, col: 1 },
				}),
			],
			TABLE_ID,
		);

		expect(presence.forCell(0, 0)).toMatchObject({
			clientId: 77,
			isHead: false,
		});
		expect(presence.forCell(0, 1)?.isHead).toBe(false);
		expect(presence.forCell(1, 0)?.isHead).toBe(false);
		expect(presence.forCell(1, 1)?.isHead).toBe(true);
		expect(presence.forCell(2, 0)).toBeNull();
	});

	it("reads a range backwards as well as forwards", () => {
		const presence = resolveRemoteCellPresence(
			[
				cellSelection({
					anchor: { row: 2, col: 3 },
					head: { row: 1, col: 2 },
				}),
			],
			TABLE_ID,
		);

		expect(presence.forCell(1, 2)?.isHead).toBe(true);
		expect(presence.forCell(2, 3)).not.toBeNull();
		expect(presence.forCell(1, 3)).not.toBeNull();
		expect(presence.forCell(2, 1)).toBeNull();
	});

	it("gives an overlapping cell to the freshest peer", () => {
		const stale = cellSelection({ clientId: 1, clock: 5 });
		const fresh = cellSelection({ clientId: 2, clock: 9 });

		expect(
			resolveRemoteCellPresence([stale, fresh], TABLE_ID).forCell(0, 0),
		).toMatchObject({ clientId: 2 });
		// order in the controller list must not change the winner
		expect(
			resolveRemoteCellPresence([fresh, stale], TABLE_ID).forCell(0, 0),
		).toMatchObject({ clientId: 2 });
	});

	it("breaks an equal clock on client id so every peer agrees", () => {
		const left = cellSelection({ clientId: 9, clock: 7 });
		const right = cellSelection({ clientId: 4, clock: 7 });

		expect(
			resolveRemoteCellPresence([left, right], TABLE_ID).forCell(0, 0),
		).toMatchObject({ clientId: 4 });
		expect(
			resolveRemoteCellPresence([right, left], TABLE_ID).forCell(0, 0),
		).toMatchObject({ clientId: 4 });
	});

	it("ignores other blocks and other selection kinds", () => {
		const selections = [
			cellSelection({ blockId: "table-2" }),
			{
				kind: "block",
				clientId: 78,
				user: { id: "u3", name: "Lovelace" },
				blockIds: [TABLE_ID],
				clock: 11,
			},
			{
				kind: "text",
				clientId: 79,
				user: { id: "u4", name: "Turing" },
				anchor: { blockId: TABLE_ID, offset: 0 },
				head: { blockId: TABLE_ID, offset: 2 },
				clock: 11,
			},
		];

		expect(
			resolveRemoteCellPresence(selections, TABLE_ID).forCell(0, 0),
		).toBeNull();
	});
});
