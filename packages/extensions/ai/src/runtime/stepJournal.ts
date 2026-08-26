import type { ModelMessage, ModelMessagePart } from "@input/pen-types";

export interface ToolJournalEntry {
	toolCallId: string;
	toolName: string;
	input: unknown;
	output: unknown;
	isError?: boolean;
}

export interface BuildAgentMessagesInput {
	prompt: string;
	workingSet: string | null;
	toolResults: ToolJournalEntry[];
}

// Compaction keeps tool results bounded without blinding the model: a full
// read_document on a mid-sized document must survive intact, and anything
// that is cut must say so explicitly so the model can re-read a narrower
// range instead of guessing.
export const AI_TOOL_RESULT_MAX_CHARS = 24_000;

const MAX_OBJECT_KEYS = 32;
const MAX_ARRAY_ITEMS = 200;
const MAX_STRING_LENGTH = AI_TOOL_RESULT_MAX_CHARS;

export function buildAgentMessages(
	input: BuildAgentMessagesInput,
): ModelMessage[] {
	const intro = input.workingSet
		? `${input.workingSet}\n\nUser request:\n${input.prompt}`
		: input.prompt;
	const messages: ModelMessage[] = [{ role: "user", content: intro }];

	for (const toolResult of input.toolResults) {
		messages.push({
			role: "assistant",
			content: [{
				type: "tool-call",
				toolCallId: toolResult.toolCallId,
				toolName: toolResult.toolName,
				input: toolResult.input,
			}],
		});
		messages.push({
			role: "tool",
			content: [{
				type: "tool-result",
				toolCallId: toolResult.toolCallId,
				result: compactToolResult(toolResult.output),
				isError: toolResult.isError,
			}],
		});
	}

	return messages;
}

export function buildAssistantToolCallParts(
	toolCalls: ToolJournalEntry[],
	passTextBuffer: string,
): ModelMessagePart[] {
	const parts: ModelMessagePart[] = [];
	if (passTextBuffer.length > 0) {
		parts.push({ type: "text", text: passTextBuffer });
	}
	return [
		...parts,
		...toolCalls.map<ModelMessagePart>((toolCall) => ({
			type: "tool-call",
			toolCallId: toolCall.toolCallId,
			toolName: toolCall.toolName,
			input: toolCall.input,
		})),
	];
}

export function compactToolResult(value: unknown): unknown {
	if (typeof value === "string") {
		return value.length <= MAX_STRING_LENGTH
			? value
			: `${value.slice(0, MAX_STRING_LENGTH).trimEnd()}… [truncated ${value.length - MAX_STRING_LENGTH} chars — re-read a narrower range for the rest]`;
	}
	if (Array.isArray(value)) {
		const compacted = value
			.slice(0, MAX_ARRAY_ITEMS)
			.map((entry) => compactToolResult(entry));
		if (value.length > MAX_ARRAY_ITEMS) {
			compacted.push(
				`[truncated ${value.length - MAX_ARRAY_ITEMS} more items — re-read a narrower range for the rest]`,
			);
		}
		return compacted;
	}
	if (value && typeof value === "object") {
		const allEntries = Object.entries(value as Record<string, unknown>);
		const entries = allEntries.slice(0, MAX_OBJECT_KEYS);
		const compacted = Object.fromEntries(
			entries.map(([key, entryValue]) => [key, compactToolResult(entryValue)]),
		);
		if (allEntries.length > MAX_OBJECT_KEYS) {
			compacted["[truncated]"] =
				`${allEntries.length - MAX_OBJECT_KEYS} more keys omitted`;
		}
		return compacted;
	}
	return value;
}
