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
				type: "splice-text",
				blockId: first.id,
				from: 0,
				to: 0,
				insert: "hi",
			},
			{
				type: "splice-text",
				blockId: first.id,
				from: 2,
				to: 2,
				insert: { nodeType: "mention", props: { id: "ada", label: "Ada" } },
			},
			{
				type: "splice-text",
				blockId: first.id,
				from: 3,
				to: 3,
				insert: "z",
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
