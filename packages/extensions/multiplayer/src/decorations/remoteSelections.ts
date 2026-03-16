import type { BlockDecoration, Decoration, Editor, InlineDecoration } from "@pen/types";
import type { RemoteSelectionState } from "../types";

export function buildRemoteSelectionDecorations(
	editor: Editor,
	selections: readonly RemoteSelectionState[],
): Decoration[] {
	const decorations: Decoration[] = [];
	const blockOrder = editor.documentState.blockOrder;

	for (const selection of selections) {
		if (selection.kind === "block") {
			decorations.push(...buildBlockSelectionDecorations(selection));
			continue;
		}

		decorations.push(
			...buildSelectionDecorationsForRange(editor, blockOrder, selection),
		);
	}

	return decorations;
}

function buildBlockSelectionDecorations(
	selection: Extract<RemoteSelectionState, { kind: "block" }>,
): BlockDecoration[] {
	return selection.blockIds.map((blockId: string) => ({
		type: "block",
		blockId,
		position: "wrap",
		attributes: {
			class: "pen-multiplayer-block-selection",
			style: `--pen-multiplayer-color: ${selection.user.color}`,
			"data-pen-multiplayer-block-selection": "",
			"data-multiplayer-client-id": String(selection.clientId),
			"data-user-id": selection.user.id,
			"data-user-name": selection.user.name,
		},
	}));
}

function buildSelectionDecorationsForRange(
	editor: Editor,
	blockOrder: readonly string[],
	selection: Extract<RemoteSelectionState, { kind: "text" }>,
): InlineDecoration[] {
	const anchorIndex = blockOrder.indexOf(selection.anchor.blockId);
	const headIndex = blockOrder.indexOf(selection.head.blockId);
	if (anchorIndex < 0 || headIndex < 0) {
		return [];
	}

	if (anchorIndex === headIndex) {
		const from = Math.min(selection.anchor.offset, selection.head.offset);
		const to = Math.max(selection.anchor.offset, selection.head.offset);
		if (from === to) {
			return [];
		}
		return [
			createSelectionDecoration(selection, selection.anchor.blockId, from, to),
		];
	}

	const startIndex = Math.min(anchorIndex, headIndex);
	const endIndex = Math.max(anchorIndex, headIndex);
	const isForward = anchorIndex <= headIndex;
	const decorations: InlineDecoration[] = [];

	for (let index = startIndex; index <= endIndex; index += 1) {
		const blockId = blockOrder[index];
		const blockLength = resolveBlockLength(editor, blockId);

		let from = 0;
		let to = blockLength;

		if (index === startIndex) {
			from = isForward ? selection.anchor.offset : selection.head.offset;
		} else if (index === endIndex) {
			to = isForward ? selection.head.offset : selection.anchor.offset;
		}

		if (to <= from) {
			continue;
		}

		decorations.push(createSelectionDecoration(selection, blockId, from, to));
	}

	return decorations;
}

function createSelectionDecoration(
	selection: Extract<RemoteSelectionState, { kind: "text" }>,
	blockId: string,
	from: number,
	to: number,
): InlineDecoration {
	return {
		type: "inline",
		blockId,
		from,
		to,
		key: `multiplayer-selection:${selection.clientId}:${blockId}:${from}:${to}:${selection.clock}`,
		attributes: {
			class: "pen-multiplayer-selection",
			style: `--pen-multiplayer-color: ${selection.user.color}`,
			"data-pen-multiplayer-selection": "",
			"data-multiplayer-client-id": String(selection.clientId),
			"data-user-id": selection.user.id,
			"data-user-name": selection.user.name,
		},
	};
}

function resolveBlockLength(editor: Editor, blockId: string): number {
	return editor.getBlock(blockId)?.textContent({ resolved: true }).length ?? 0;
}
