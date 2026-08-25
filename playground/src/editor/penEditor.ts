import { aiExtension } from "@input/pen-ai";
import { createEditor } from "@input/pen-core";
import { inputRulesExtension } from "@input/pen-input-rules";
import { defaultPreset } from "@input/pen-preset-default";
import type { Editor, Extension } from "@input/pen-types";
import { createPenModel } from "../ai/penModel";

/**
 * Document tools the agent may call.
 *
 * Pen denies every document-changing tool by default, so this list is the
 * complete set of writes the agent can perform. Read-only tools (reading the
 * document, inspecting the selection) need no permission.
 */
const AI_WRITABLE_TOOLS = [
	"write_document",
	"insert_block",
	"update_block",
	"delete_block",
	"move_block",
];

/**
 * The whole editor setup. Two pieces:
 *
 * - `defaultPreset()` is the batteries-included bundle: the default block
 *   schema, undo, keyboard shortcuts, and the document-ops tools the agent
 *   calls.
 * - `extensions` adds what this app wants on top.
 */
export function createPenEditor(extra: Extension[] = []): Editor {
	return createEditor({
		preset: defaultPreset(),
		extensions: [
			aiExtension({
				model: createPenModel(),
				allowedMutatingTools: AI_WRITABLE_TOOLS,
			}),
			// Markdown-style shortcuts while typing: `# ` for a heading,
			// `- ` for a list item, and so on.
			inputRulesExtension(),
			...extra,
		],
	});
}
