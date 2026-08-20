import type { ChangeSummary, Editor, Point } from "@input/pen-types";
import type {
	MultiplayerAwarenessState,
	RemoteCursorState,
	RemoteSelectionState,
} from "../types";

export function mapRemoteCursors(
	editor: Editor,
	cursors: readonly RemoteCursorState[],
	states: Map<number, MultiplayerAwarenessState>,
): readonly RemoteCursorState[] {
	return cursors.map((cursor) => {
		const commitId = states.get(cursor.clientId)?.cursor?.commitId;
		const mapped = mapRemotePoint(
			editor,
			{ blockId: cursor.blockId, offset: cursor.offset },
			commitId,
		);
		if (
			mapped.blockId === cursor.blockId &&
			mapped.offset === cursor.offset
		) {
			return cursor;
		}
		return {
			...cursor,
			blockId: mapped.blockId,
			offset: mapped.offset,
		};
	});
}

export function mapRemoteSelections(
	editor: Editor,
	selections: readonly RemoteSelectionState[],
	states: Map<number, MultiplayerAwarenessState>,
): readonly RemoteSelectionState[] {
	return selections.map((selection) => {
		if (selection.kind === "block") {
			return selection;
		}
		const commitId = states.get(selection.clientId)?.selection?.commitId;
		const composed = composeSince(editor, commitId);
		if (!composed) {
			return selection;
		}
		const mapped = composed.mapRange(
			{ anchor: selection.anchor, focus: selection.head },
			{ mode: "clamp" },
		);
		if (
			!mapped ||
			(mapped.anchor.blockId === selection.anchor.blockId &&
				mapped.anchor.offset === selection.anchor.offset &&
				mapped.focus.blockId === selection.head.blockId &&
				mapped.focus.offset === selection.head.offset)
		) {
			return selection;
		}
		return {
			...selection,
			anchor: mapped.anchor,
			head: mapped.focus,
		};
	});
}

function mapRemotePoint(
	editor: Editor,
	point: Point,
	commitId: number | undefined,
): Point {
	const composed = composeSince(editor, commitId);
	if (!composed) {
		return point;
	}
	return composed.mapPoint(point, 1, "clamp") ?? point;
}

function composeSince(
	editor: Editor,
	commitId: number | undefined,
): ChangeSummary | null {
	if (commitId == null) {
		return null;
	}
	const latest = editor.summaryLog.latest()?.commitId ?? commitId;
	if (commitId >= latest) {
		return null;
	}
	return editor.summaryLog.between(commitId, latest);
}
