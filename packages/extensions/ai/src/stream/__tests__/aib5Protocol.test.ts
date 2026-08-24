import {
	PEN_STREAM_PROTOCOL_VERSION,
	type ApplyOptions,
	type DiagnosticEvent,
	type DocumentOp,
	type Editor,
	type PenStreamPart,
} from "@input/pen-types";
import { describe, expect, it, vi } from "vitest";
import { processStream } from "../processStream";

function createStreamEditor(): {
	editor: Editor;
	apply: ReturnType<typeof vi.fn<(ops: DocumentOp[], options?: ApplyOptions) => void>>;
	emit: ReturnType<typeof vi.fn>;
} {
	const apply = vi.fn<(ops: DocumentOp[], options?: ApplyOptions) => void>();
	const emit = vi.fn();
	const editor = {
		documentProfile: "article",
		schema: {
			resolve(blockType: string) {
				if (blockType !== "paragraph") {
					return null;
				}
				return { type: blockType, content: "inline" };
			},
		},
		getBlock: () => null,
		apply,
		internals: {
			emit,
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

	return { editor, apply, emit };
}

async function* createStream(parts: PenStreamPart[]): AsyncIterable<PenStreamPart> {
	for (const part of parts) {
		yield part;
	}
}

function diagnosticsOf(emit: ReturnType<typeof vi.fn>): DiagnosticEvent[] {
	return emit.mock.calls
		.filter((call) => call[0] === "diagnostic")
		.map((call) => call[1] as DiagnosticEvent);
}

describe("@input/pen-ai/stream AIB5 protocol leftovers", () => {
	it("AIB5: version constant is 1", () => {
		expect(PEN_STREAM_PROTOCOL_VERSION).toBe(1);
	});

	it("AIB5: unknown part dropped", async () => {
		const { editor, apply, emit } = createStreamEditor();
		const unknown = { type: "future-part" } as unknown as PenStreamPart;

		await processStream(
			createStream([
				unknown,
				{
					type: "block-insert",
					blockId: "block-2",
					blockType: "paragraph",
					position: "last",
				},
			]),
			editor,
			{ allowedMutatingTools: ["insert_block"] },
		);

		expect(diagnosticsOf(emit)).toEqual([
			expect.objectContaining({
				code: "stream-part-unknown",
				partType: "future-part",
			}),
		]);
		expect(apply).toHaveBeenCalledTimes(1);
		expect(apply.mock.calls[0]?.[0][0]).toMatchObject({
			type: "insert-block",
			blockId: "block-2",
		});
	});
});
