import { hasRunTools, type ChatEvent, type ChatRequest } from "./protocol";

const SCRIPTED_PARAGRAPH =
	"This paragraph came from the playground's scripted model, which answers " +
	"when ANTHROPIC_API_KEY is not set. Pen streamed it into the document one " +
	"delta at a time, exactly as it would a real model's reply.";

const SCRIPTED_MARKDOWN = [
	"## Written by a tool call",
	"",
	"The scripted model asked for `write_document` instead of writing prose, and",
	"Pen turned this markdown into blocks:",
	"",
	"- Every block here is a real document operation",
	"- The inspector on the right lists them",
	"- One press of undo removes the whole section",
].join("\n");

/**
 * The offline stand-in for a model, so the playground works with no API key.
 *
 * It answers in whichever form Pen asked for. When the request carries tools,
 * Pen wants structural edits, so it calls `write_document` and says nothing.
 * When it carries none, Pen wants prose to drop into a block, so it streams
 * text and calls nothing.
 */
export async function* streamScripted(
	request: ChatRequest,
): AsyncGenerator<ChatEvent> {
	const canWrite = request.tools.some(
		(tool) => tool.name === "write_document",
	);

	// The tool already ran, so this pass has nothing left to do. Without this
	// the loop would keep calling the tool until it hit its step limit.
	if (canWrite && !hasRunTools(request.messages)) {
		yield {
			type: "tool-call",
			toolCallId: `scripted-${Date.now()}`,
			toolName: "write_document",
			input: {
				format: "markdown",
				content: SCRIPTED_MARKDOWN,
				position: "last",
			},
		};
	} else if (!canWrite) {
		yield* streamText(SCRIPTED_PARAGRAPH);
	}

	yield { type: "done" };
}

/** Streams a word at a time so the document fills in the way it would live. */
async function* streamText(text: string): AsyncGenerator<ChatEvent> {
	for (const word of text.split(" ")) {
		await sleep(25);
		yield { type: "text-delta", delta: `${word} ` };
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
