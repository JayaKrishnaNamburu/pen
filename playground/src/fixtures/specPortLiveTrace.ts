import type { Editor } from "@input/pen-types";

export const SPEC_PORT_MENTION_TRACE = "mention";

export function seedSpecPortLiveTraceIfRequested(
	editor: Editor,
	search = window.location.search,
): boolean {
	const trace = new URLSearchParams(search).get("trace");
	if (trace !== SPEC_PORT_MENTION_TRACE) {
		return false;
	}
	return applyMentionAtomSeed(editor);
}

export function applyMentionAtomSeed(editor: Editor): boolean {
	if (documentHasMention(editor)) {
		return false;
	}

	const first = editor.firstBlock();
	if (!first || first.type !== "paragraph") {
		return false;
	}

	if (first.length() > 0) {
		return false;
	}

	editor.apply(
		[
			{
				type: "insert-text",
				blockId: first.id,
				offset: 0,
				text: "hi",
			},
			{
				type: "insert-inline-node",
				blockId: first.id,
				offset: 2,
				nodeType: "mention",
				props: { id: "ada", label: "Ada" },
			},
			{
				type: "insert-text",
				blockId: first.id,
				offset: 3,
				text: "z",
			},
		],
		{ origin: "system" },
	);
	return true;
}

function documentHasMention(editor: Editor): boolean {
	for (const block of editor.blocks()) {
		for (const delta of block.inlineDeltas()) {
			if (
				typeof delta.insert === "object" &&
				delta.insert.type === "mention"
			) {
				return true;
			}
		}
	}
	return false;
}
