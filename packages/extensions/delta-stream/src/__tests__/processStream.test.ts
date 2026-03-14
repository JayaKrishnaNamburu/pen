import type { ApplyOptions, DocumentOp, Editor, PenStreamPart } from "@pen/types";
import { describe, expect, it, vi } from "vitest";
import { processStream } from "../processStream";

function createReadOnlyTargetEditor(): Editor {
	const block = {
		id: "subdocument-1",
		type: "subdocument",
	};

	return {
		documentProfile: "structured",
		schema: {
			resolve(blockType: string) {
				if (blockType !== "subdocument") {
					return null;
				}
				return {
					type: "subdocument",
					content: "subdocument",
					display: {
						hidden: true,
					},
				};
			},
		},
		getBlock: (blockId: string) => (blockId === block.id ? block : null),
		apply: vi.fn<(ops: DocumentOp[], options?: ApplyOptions) => void>(),
		internals: {
			getSlot(key: string) {
				if (key === "delta-stream:target") {
					return {
						generationZone: null,
						beginStreaming: vi.fn(),
						appendDelta: vi.fn(),
						endStreaming: vi.fn(),
					};
				}
				return undefined;
			},
		},
	} as unknown as Editor;
}

function createToolRuntimeEditor(): {
	editor: Editor;
	onPart: ReturnType<typeof vi.fn>;
} {
	const streamingTarget = {
		generationZone: null,
		beginStreaming: vi.fn(),
		appendDelta: vi.fn(),
		endStreaming: vi.fn(),
	};
	const runtime = {
		executeTool: vi.fn(async function* () {
			yield { chunk: "one" };
			yield { chunk: "two" };
		}),
	};
	const onPart = vi.fn();

	return {
		editor: {
			documentProfile: "structured",
			schema: {
				resolve: () => null,
			},
			apply: vi.fn<(ops: DocumentOp[], options?: ApplyOptions) => void>(),
			internals: {
				getSlot(key: string) {
					if (key === "delta-stream:target") {
						return streamingTarget;
					}
					if (key === "document-ops:toolRuntime") {
						return runtime;
					}
					return undefined;
				},
			},
		} as unknown as Editor,
		onPart,
	};
}

async function* createStream(parts: PenStreamPart[]): AsyncIterable<PenStreamPart> {
	for (const part of parts) {
		yield part;
	}
}

describe("@pen/delta-stream processStream", () => {
	it("rejects streamed block mutations against read-only targets", async () => {
		const editor = createReadOnlyTargetEditor();

		await expect(
			processStream(
				createStream([
					{
						type: "block-update",
						blockId: "subdocument-1",
						props: { title: "Forbidden" },
					},
				]),
				editor,
			),
		).rejects.toThrow(
			'Block "subdocument-1" of type "subdocument" is not editable in structured documents.',
		);

		expect(editor.apply).not.toHaveBeenCalled();
	});

	it("emits progressive tool-output updates for async tool results", async () => {
		const { editor, onPart } = createToolRuntimeEditor();

		await processStream(
			createStream([
				{
					type: "tool-input-available",
					toolCallId: "tool-1",
					toolName: "search_document",
					input: {},
				},
			]),
			editor,
			{ onPart },
		);

		expect(onPart).toHaveBeenCalledWith({
			type: "tool-output",
			toolCallId: "tool-1",
			output: { chunk: "one" },
		});
		expect(onPart).toHaveBeenCalledWith({
			type: "tool-output",
			toolCallId: "tool-1",
			output: [{ chunk: "one" }, { chunk: "two" }],
		});
	});
});
