import { aiExtension } from "@input/pen-ai";
import type { AIEditStreaming, AIMutationPreference } from "@input/pen-ai";
import { smoothStreamExtension } from "@input/pen-ai/stream";
import { createEditor } from "@input/pen";
import { autoformatExtension } from "@input/pen-autoformat";
import type { Editor, Extension } from "@input/pen-types";
import { createPenModel } from "../ai/penModel";
import { blobImageUrlExtension } from "./assets";
import { prefersReducedMotion } from "./prefersReducedMotion";

/**
 * Document tools the agent may call.
 *
 * Pen denies every document-changing tool by default, so this list is the
 * complete set of writes the agent can perform, and it is also the list the
 * model is shown. Read-only tools (reading the document, inspecting the
 * selection) need no permission. Durable edits go through `edit_document`.
 */
const AI_WRITABLE_TOOLS = ["edit_document"];

/**
 * How AI writes land, read from `?mutation=direct`. The playground now
 * defaults to staged review; the query param is the construction-time
 * escape hatch. Runtime switching is `setMutationPreference` on the
 * controller (the Review toggle on the agent bar).
 */
function readMutationPreference(): AIMutationPreference {
	const requested = new URLSearchParams(window.location.search).get(
		"mutation",
	);
	return requested === "direct" ? "direct" : "suggestions";
}

/**
 * How much of a streaming edit shows, read from `?editStreaming=`. The default
 * writes each settled block as it arrives (EC20); `preview` keeps the arriving
 * text a decoration until the call closes, which is what a multiplayer host
 * wants, and `atomic` shows nothing until it lands.
 */
function readEditStreaming(): AIEditStreaming | undefined {
	const requested = new URLSearchParams(window.location.search).get(
		"editStreaming",
	);
	return requested === "preview" || requested === "atomic"
		? requested
		: undefined;
}

/**
 * The whole editor setup. The starter's `createEditor` already brings the
 * batteries — the default block schema, undo, keyboard shortcuts, and the
 * document tools the agent calls — so `extensions` is only what this app
 * wants on top.
 */
export function createPenEditor(extra: Extension[] = []): Editor {
	const mutationPreference = readMutationPreference();
	const editStreaming = readEditStreaming();

	return createEditor({
		extensions: [
			aiExtension({
				model: createPenModel(),
				allowedMutatingTools: AI_WRITABLE_TOOLS,
				// Block prompts produce markdown so structural asks (lists,
				// tables, headings) parse into real blocks instead of being
				// pasted in as literal text.
				contentFormat: { blockGeneration: "markdown" },
				mutationPreference,
				...(editStreaming ? { editStreaming } : {}),
			}),
			// Paint-only pacing for `openTextStream` writes. Reduced motion is
			// this host's call; the media query is kept live in `usePenEditor`.
			smoothStreamExtension({
				enabled: !prefersReducedMotion(),
			}),
			// Markdown-style shortcuts while typing: `# ` for a heading,
			// `- ` for a list item, and so on.
			autoformatExtension(),
			// Pasted, dropped, and picked images live in an in-memory store
			// that returns `blob:` URLs, which the default URL policy would
			// drop at render time.
			blobImageUrlExtension,
			...extra,
		],
	});
}
