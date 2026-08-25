import { toStreamingPreviewText } from "./streamingPreviewText";

export const TRUNCATED_EDIT_DOCUMENT_MARKER = "truncated";

export interface EditDocumentPreviewUpdate {
	toolCallId: string;
	/**
	 * Which operation of the payload is arriving, counting from zero.
	 *
	 * A payload holds several operations (EC4) and they arrive in order, so the
	 * one at the end of the fragment is the one being written. Consumers key
	 * their state on this: an operation that has stopped arriving is final, and
	 * its preview must not be mistaken for the next one's.
	 */
	operationIndex: number;
	blockId: string | null;
	/**
	 * The arriving operation's name, when the fragment has reached it. The host
	 * needs it to place the preview: text arriving for `insert_blocks` is added
	 * after the block it names, while a replace op covers that block's text.
	 */
	operation: string | null;
	/** What the preview shows: markdown syntax stripped (EC15). */
	text: string;
	/**
	 * The payload as sent, when it is markdown. Display text cannot be written
	 * back to the document — the syntax is what carries the block structure —
	 * so anything that commits while the call is open reads this instead.
	 */
	markdown: string | null;
}

export interface TruncatedEditDocumentRefusal {
	ok: false;
	appliedOperations: [];
	rejected: Array<{ index: number; operation: string; reason: string }>;
	outline: [];
	hint: string;
}

/**
 * Best-effort extraction of the arriving operation's content from a growing
 * `edit_document` argument JSON. Mid-stream fragments are not valid JSON
 * (Anthropic `input_json_delta`); the scanner tolerates an unterminated
 * string tail and never treats a partial as a complete payload.
 *
 * Keys are read from one element of the `operations` array rather than from the
 * payload at large: a scan over the whole text returns the *first* `blockId` it
 * finds, so every operation after the first previewed against operation one's
 * target and then snapped into place when the call closed.
 */
export function extractEditDocumentPreview(
	json: string,
	toolCallId: string,
): EditDocumentPreviewUpdate | null {
	const fragments = readOperationFragments(json);
	const operationIndex = fragments.length - 1;
	const fragment = fragments[operationIndex];
	if (fragment == null) {
		return null;
	}
	// Ids and operation names only mean something whole: half of `"closing"` is
	// `"closi"`, which addresses no block — or worse, a different one whose id
	// it is a prefix of. Content is the opposite: a prefix of it is the point.
	const operation = extractJsonString(fragment, "operation", {
		terminated: true,
	});
	const blockId =
		extractJsonString(fragment, "blockId", { terminated: true }) ??
		extractFirstJsonArrayString(fragment, "blockIds") ??
		extractJsonString(fragment, "referenceBlockId", { terminated: true });
	// Which key the payload came from decides whether it is markdown: only the
	// block-shaped operations take `markdown`, and `text` is already plain, so
	// formatting it would eat a leading `#` a person actually typed.
	const plainText = extractJsonString(fragment, "text");
	const markdown =
		plainText == null ? extractJsonString(fragment, "markdown") : null;
	const text = plainText ?? markdown;
	if (text == null && blockId == null && operation == null) {
		return null;
	}
	return {
		toolCallId,
		operationIndex,
		blockId,
		operation,
		text:
			markdown == null ? (text ?? "") : toStreamingPreviewText(markdown),
		markdown,
	};
}

/**
 * The raw text of each element of the `operations` array, including a trailing
 * element that has not closed yet. Brace depth is what delimits an element;
 * a bracket inside one (`blockIds`) is depth-guarded, and a brace inside a
 * string (markdown content) is skipped with the string.
 */
function readOperationFragments(json: string): string[] {
	const keyIndex = indexOfJsonKey(json, "operations");
	if (keyIndex < 0) {
		return [];
	}
	const arrayStart = json.indexOf("[", keyIndex);
	if (arrayStart < 0) {
		return [];
	}
	const fragments: string[] = [];
	let depth = 0;
	let elementStart = -1;
	let isInString = false;
	for (let index = arrayStart + 1; index < json.length; index += 1) {
		const character = json[index]!;
		if (isInString) {
			if (character === "\\") {
				index += 1;
				continue;
			}
			if (character === '"') {
				isInString = false;
			}
			continue;
		}
		if (character === '"') {
			isInString = true;
			continue;
		}
		if (character === "{") {
			if (depth === 0) {
				elementStart = index;
			}
			depth += 1;
			continue;
		}
		if (character === "}") {
			depth -= 1;
			if (depth === 0 && elementStart >= 0) {
				fragments.push(json.slice(elementStart, index + 1));
				elementStart = -1;
			}
			continue;
		}
		if (character === "]" && depth === 0) {
			break;
		}
	}
	if (depth > 0 && elementStart >= 0) {
		fragments.push(json.slice(elementStart));
	}
	return fragments;
}

export function createEditDocumentPreview(
	onUpdate: (update: EditDocumentPreviewUpdate | null) => void,
) {
	let json = "";
	let toolCallId = "";
	let last: EditDocumentPreviewUpdate | null = null;

	const publish = (next: EditDocumentPreviewUpdate | null): void => {
		if (
			last?.toolCallId === next?.toolCallId &&
			last?.operationIndex === next?.operationIndex &&
			last?.blockId === next?.blockId &&
			last?.operation === next?.operation &&
			last?.text === next?.text &&
			// Stripping can map two payloads onto one display string (a `**`
			// that has only opened, say). Whoever writes the payload has to see
			// the difference even when the reader cannot.
			last?.markdown === next?.markdown
		) {
			return;
		}
		last = next;
		onUpdate(next);
	};

	return {
		start(nextToolCallId: string): void {
			toolCallId = nextToolCallId;
			json = "";
			publish(null);
		},
		append(delta: string): void {
			if (toolCallId.length === 0) {
				return;
			}
			json += delta;
			const next = extractEditDocumentPreview(json, toolCallId);
			if (next) {
				publish(next);
			}
		},
		withdraw(): void {
			toolCallId = "";
			json = "";
			publish(null);
		},
		get snapshot(): EditDocumentPreviewUpdate | null {
			return last;
		},
	};
}

export function isTruncatedEditDocumentInput(input: unknown): boolean {
	return (
		input != null &&
		typeof input === "object" &&
		!Array.isArray(input) &&
		(input as { [TRUNCATED_EDIT_DOCUMENT_MARKER]?: unknown })[
			TRUNCATED_EDIT_DOCUMENT_MARKER
		] === true
	);
}

export function truncatedEditDocumentRefusal(
	reason = "Tool input was truncated (max_tokens); the argument JSON did not parse. Nothing was applied.",
): TruncatedEditDocumentRefusal {
	return {
		ok: false,
		appliedOperations: [],
		rejected: [
			{
				index: 0,
				operation: "edit_document",
				reason,
			},
		],
		outline: [],
		hint: reason,
	};
}

function extractJsonString(
	json: string,
	key: string,
	options?: { terminated?: boolean },
): string | null {
	const keyIndex = indexOfJsonKey(json, key);
	if (keyIndex < 0) {
		return null;
	}
	const colon = json.indexOf(":", keyIndex);
	if (colon < 0) {
		return null;
	}
	let index = colon + 1;
	while (index < json.length && isJsonWhitespace(json[index]!)) {
		index += 1;
	}
	if (json[index] !== '"') {
		return null;
	}
	return readJsonStringValue(json, index + 1, options);
}

function extractFirstJsonArrayString(json: string, key: string): string | null {
	const keyIndex = indexOfJsonKey(json, key);
	if (keyIndex < 0) {
		return null;
	}
	const colon = json.indexOf(":", keyIndex);
	if (colon < 0) {
		return null;
	}
	const open = json.indexOf("[", colon);
	if (open < 0) {
		return null;
	}
	let index = open + 1;
	while (index < json.length && isJsonWhitespace(json[index]!)) {
		index += 1;
	}
	if (json[index] !== '"') {
		return null;
	}
	// An id in a list is an id: hold it back until its quote closes.
	return readJsonStringValue(json, index + 1, { terminated: true });
}

function readJsonStringValue(
	json: string,
	start: number,
	options?: { terminated?: boolean },
): string | null {
	const read = readJsonString(json, start);
	if (options?.terminated === true && !read.isTerminated) {
		return null;
	}
	return read.value;
}

function indexOfJsonKey(json: string, key: string): number {
	const needle = `"${key}"`;
	let from = 0;
	while (from < json.length) {
		const index = json.indexOf(needle, from);
		if (index < 0) {
			return -1;
		}
		if (!isLikelyInsideString(json, index)) {
			return index;
		}
		from = index + needle.length;
	}
	return -1;
}

const JSON_UNICODE_ESCAPE_LENGTH = 4;
const HEX_QUAD_PATTERN = /^[0-9a-fA-F]{4}$/;

/**
 * Reads a JSON string body that may stop mid-character, and says whether its
 * closing quote arrived — the difference between a value and a prefix of one.
 *
 * An escape that has not finished arriving is dropped rather than decoded:
 * emitting the `u` of a half-sent `\u2014` would put a literal `u2014` on
 * screen and — since EC20 writes this text — into the document. Stopping short
 * costs one frame of a character that is about to arrive anyway.
 */
function readJsonString(
	json: string,
	start: number,
): { value: string; isTerminated: boolean } {
	let output = "";
	for (let index = start; index < json.length; index += 1) {
		const character = json[index]!;
		if (character === "\\") {
			const escaped = json[index + 1];
			if (escaped == null) {
				return { value: output, isTerminated: false };
			}
			if (escaped === "u") {
				const hexStart = index + 2;
				const hex = json.slice(
					hexStart,
					hexStart + JSON_UNICODE_ESCAPE_LENGTH,
				);
				if (!HEX_QUAD_PATTERN.test(hex)) {
					return { value: output, isTerminated: false };
				}
				output += String.fromCharCode(Number.parseInt(hex, 16));
				index = hexStart + JSON_UNICODE_ESCAPE_LENGTH - 1;
				continue;
			}
			output += unescapeJson(escaped);
			index += 1;
			continue;
		}
		if (character === '"') {
			return { value: output, isTerminated: true };
		}
		output += character;
	}
	return { value: output, isTerminated: false };
}

function unescapeJson(escaped: string): string {
	switch (escaped) {
		case "n":
			return "\n";
		case "r":
			return "\r";
		case "t":
			return "\t";
		case "b":
			return "\b";
		case "f":
			return "\f";
		case '"':
		case "\\":
		case "/":
			return escaped;
		default:
			return escaped;
	}
}

function isJsonWhitespace(character: string): boolean {
	return (
		character === " " ||
		character === "\t" ||
		character === "\n" ||
		character === "\r"
	);
}

function isLikelyInsideString(json: string, index: number): boolean {
	let inString = false;
	for (let cursor = 0; cursor < index; cursor += 1) {
		const character = json[cursor]!;
		if (character === "\\" && inString) {
			cursor += 1;
			continue;
		}
		if (character === '"') {
			inString = !inString;
		}
	}
	return inString;
}
