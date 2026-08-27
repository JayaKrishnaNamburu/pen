/**
 * Peer presence inside a table grid.
 *
 * The shapes here mirror the cell member of `RemoteSelectionState` in
 * `@input/pen-multiplayer` structurally rather than by import: the DOM engine
 * sits below the extension packages, so it cannot depend on that type.
 */

export interface RemoteCellCoord {
	readonly row: number;
	readonly col: number;
}

export interface RemoteCellUser {
	readonly id: string;
	readonly name: string;
	readonly color?: string;
}

export interface RemoteCellSelectionLike {
	readonly kind: "cell";
	readonly clientId: number;
	readonly user: RemoteCellUser;
	readonly blockId: string;
	readonly anchor: RemoteCellCoord;
	readonly head: RemoteCellCoord;
	readonly clock: number;
}

/** A peer occupying one grid cell. */
export interface RemoteCellPresence {
	readonly clientId: number;
	readonly user: RemoteCellUser;
	/** True on the peer's head cell, the single anchor for a name label. */
	readonly isHead: boolean;
}

export interface RemoteCellPresenceMap {
	forCell(row: number, col: number): RemoteCellPresence | null;
}

const EMPTY_PRESENCE: RemoteCellPresenceMap = { forCell: () => null };

/**
 * Resolve which peer occupies each cell of one table block.
 *
 * Peers overlap — two people can sit in the same cell — so selections are
 * ranked freshest first and the winner claims the cell. An equal clock falls
 * back to the lower client id, which keeps the result identical on every peer.
 */
export function resolveRemoteCellPresence(
	selections: readonly { readonly kind: string }[],
	blockId: string,
): RemoteCellPresenceMap {
	const ranked = selections
		.filter(
			(selection): selection is RemoteCellSelectionLike =>
				isRemoteCellSelection(selection) &&
				selection.blockId === blockId,
		)
		.sort(byFreshest);

	if (ranked.length === 0) {
		return EMPTY_PRESENCE;
	}

	const cells = new Map<string, RemoteCellPresence>();
	for (const selection of ranked) {
		const minRow = Math.min(selection.anchor.row, selection.head.row);
		const maxRow = Math.max(selection.anchor.row, selection.head.row);
		const minCol = Math.min(selection.anchor.col, selection.head.col);
		const maxCol = Math.max(selection.anchor.col, selection.head.col);

		for (let row = minRow; row <= maxRow; row += 1) {
			for (let col = minCol; col <= maxCol; col += 1) {
				const key = presenceKey(row, col);
				if (cells.has(key)) {
					continue;
				}
				cells.set(key, {
					clientId: selection.clientId,
					user: selection.user,
					isHead:
						row === selection.head.row &&
						col === selection.head.col,
				});
			}
		}
	}

	return {
		forCell: (row, col) => cells.get(presenceKey(row, col)) ?? null,
	};
}

/**
 * Narrows the loose parameter type above. Checks only the fields this module
 * reads; the payload itself was validated against the document at COL2 ingest.
 */
function isRemoteCellSelection(
	value: unknown,
): value is RemoteCellSelectionLike {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const candidate = value as Partial<RemoteCellSelectionLike>;
	return (
		candidate.kind === "cell" &&
		typeof candidate.blockId === "string" &&
		typeof candidate.clientId === "number" &&
		isCoord(candidate.anchor) &&
		isCoord(candidate.head)
	);
}

function isCoord(value: unknown): value is RemoteCellCoord {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const candidate = value as Partial<RemoteCellCoord>;
	return (
		typeof candidate.row === "number" && typeof candidate.col === "number"
	);
}

function byFreshest(
	left: RemoteCellSelectionLike,
	right: RemoteCellSelectionLike,
): number {
	if (left.clock !== right.clock) {
		return right.clock - left.clock;
	}
	return left.clientId - right.clientId;
}

function presenceKey(row: number, col: number): string {
	return `${row}:${col}`;
}
