import { aiExtension } from "@input/pen-ai";
import type {
	AIEditChannel,
	AIEditStreaming,
	AIMutationPreference,
} from "@input/pen-ai";
import { createEditor } from "@input/pen-core";
import { inputRulesExtension } from "@input/pen-input-rules";
import { defaultPreset } from "@input/pen-preset-default";
import type { Editor, Extension } from "@input/pen-types";
import { createPenModel } from "../ai/penModel";

/**
 * Document tools the agent may call.
 *
 * Pen denies every document-changing tool by default, so this list is the
 * complete set of writes the agent can perform, and it is also the list the
 * model is shown. Read-only tools (reading the document, inspecting the
 * selection) need no permission.
 *
 * Each channel gets its own write surface so a run exercises one channel and
 * the comparison stays clean: the tool channel offers only `edit_document`.
 */
const AI_WRITABLE_TOOLS: Record<AIEditChannel, string[]> = {
	"fast-apply": [
		"write_document",
		"insert_block",
		"update_block",
		"delete_block",
		"move_block",
	],
	tool: ["edit_document"],
};

/**
 * Which edit channel to exercise, read from `?editChannel=fast-apply`.
 *
 * The playground defaults to the tool channel: `format_text` and
 * `set_block_props` only exist there, so on fast-apply a styling request has
 * no operation to land in and the model reaches for raw HTML, which that
 * channel applies as text. This is the host's default, not the library's —
 * `aiExtension()` still defaults to fast-apply until Wave 0's live
 * measurement decides (`spec-better-ai/01-edit-channel.md` EC12), and the
 * query param is how the same corpus runs through both channels in one build.
 */
function readEditChannel(): AIEditChannel {
	const requested = new URLSearchParams(window.location.search).get(
		"editChannel",
	);
	return requested === "fast-apply" ? "fast-apply" : "tool";
}

/**
 * How AI writes land, read from `?mutation=direct`. The playground now
 * defaults to staged review; the query param is the construction-time
 * escape hatch. Runtime switching is `setMutationPreference` on the
 * controller (the Review toggle on the agent bar). Composes with
 * `?editChannel=`.
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
 * The whole editor setup. Two pieces:
 *
 * - `defaultPreset()` is the batteries-included bundle: the default block
 *   schema, undo, keyboard shortcuts, and the document-ops tools the agent
 *   calls.
 * - `extensions` adds what this app wants on top.
 */
export function createPenEditor(extra: Extension[] = []): Editor {
	const editChannel = readEditChannel();
	const mutationPreference = readMutationPreference();
	const editStreaming = readEditStreaming();

	return createEditor({
		preset: defaultPreset(),
		extensions: [
			aiExtension({
				model: createPenModel(),
				allowedMutatingTools: AI_WRITABLE_TOOLS[editChannel],
				// Block prompts produce markdown so structural asks (lists,
				// tables, headings) parse into real blocks instead of being
				// pasted in as literal text.
				contentFormat: { blockGeneration: "markdown" },
				mutationPreference,
				editChannel,
				...(editStreaming ? { editStreaming } : {}),
			}),
			// Markdown-style shortcuts while typing: `# ` for a heading,
			// `- ` for a list item, and so on.
			inputRulesExtension(),
			...extra,
		],
	});
}
