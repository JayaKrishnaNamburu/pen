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

interface StreamEditorHarness {
	editor: Editor;
	apply: ReturnType<
		typeof vi.fn<(ops: DocumentOp[], options?: ApplyOptions) => void>
	>;
	emit: ReturnType<typeof vi.fn>;
	streamingTarget: {
		generationZone: { id: string } | null;
		beginStreaming: ReturnType<typeof vi.fn>;
		appendDelta: ReturnType<typeof vi.fn>;
		endStreaming: ReturnType<typeof vi.fn>;
	};
}

function createStreamEditor(overrides?: {
	hasTarget?: boolean;
	block?: { id: string; type: string } | null;
	toolRuntime?: { executeTool: ReturnType<typeof vi.fn> };
}): StreamEditorHarness {
	const block =
		overrides?.block === undefined
			? { id: "block-1", type: "paragraph" }
			: overrides.block;
	const streamingTarget = {
		generationZone: null as { id: string } | null,
		beginStreaming: vi.fn((zoneId: string) => {
			streamingTarget.generationZone = { id: zoneId };
		}),
		appendDelta: vi.fn(),
		endStreaming: vi.fn(() => {
			streamingTarget.generationZone = null;
		}),
	};
	const apply = vi.fn<(ops: DocumentOp[], options?: ApplyOptions) => void>();
	const emit = vi.fn();

	const editor = {
		documentProfile: "article",
		schema: {
			resolve(blockType: string) {
				if (!block || block.type !== blockType) {
					return null;
				}
				return {
					type: blockType,
					content: "inline",
				};
			},
		},
		getBlock: (blockId: string) =>
			block && blockId === block.id ? block : null,
		apply,
		facet: (facet: { name: string }) => {
			if (facet.name === "deltaStream.target") {
				return overrides?.hasTarget === false ? null : streamingTarget;
			}
			if (facet.name === "tools.toolRuntime") {
				return overrides?.toolRuntime ?? null;
			}
			return null;
		},
		internals: {
			emit,
		},
	} as unknown as Editor;

	return { editor, apply, emit, streamingTarget };
}

async function* createStream(
	parts: PenStreamPart[],
): AsyncIterable<PenStreamPart> {
	for (const part of parts) {
		yield part;
	}
}

function diagnosticsOf(emit: ReturnType<typeof vi.fn>): DiagnosticEvent[] {
	return emit.mock.calls
		.filter((call) => call[0] === "diagnostic")
		.map((call) => call[1] as DiagnosticEvent);
}

// every app tool folds into one `app` op, so the op type alone no longer
// distinguishes create from update from delete — the kind carries that.
function appliedOpKinds(
	apply: StreamEditorHarness["apply"],
): (string | undefined)[] {
	return apply.mock.calls.map((call) => {
		const op = call[0][0];
		return op?.type === "app" ? `app:${op.change.kind}` : op?.type;
	});
}

describe("@input/pen-ai/stream processStream AIB5", () => {
	it("AIB5: protocol version constant is the frozen handshake value", () => {
		expect(PEN_STREAM_PROTOCOL_VERSION).toBe(1);
	});

	it("AIB5: version mismatch is diagnosed and the stream is refused", async () => {
		const { editor, apply, emit } = createStreamEditor();

		await processStream(
			createStream([
				{
					type: "block-insert",
					blockId: "block-2",
					blockType: "paragraph",
					position: "last",
				},
			]),
			editor,
			{ protocolVersion: 99 },
		);

		expect(apply).not.toHaveBeenCalled();
		expect(diagnosticsOf(emit)).toEqual([
			expect.objectContaining({
				code: "stream-protocol-mismatch",
				source: "delta-stream",
				protocolVersion: 99,
				expectedVersion: PEN_STREAM_PROTOCOL_VERSION,
			}),
		]);
	});

	it("AIB5: current protocol version is accepted", async () => {
		const { editor, apply } = createStreamEditor();

		await processStream(
			createStream([
				{
					type: "block-insert",
					blockId: "block-2",
					blockType: "paragraph",
					position: "last",
				},
			]),
			editor,
			{
				protocolVersion: PEN_STREAM_PROTOCOL_VERSION,
				allowedMutatingTools: ["insert_block"],
			},
		);

		expect(apply).toHaveBeenCalledTimes(1);
	});

	it("AIB5: omitted protocol version is accepted as the current protocol", async () => {
		const { editor, apply, emit } = createStreamEditor();

		await processStream(
			createStream([
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

		expect(apply).toHaveBeenCalledTimes(1);
		expect(diagnosticsOf(emit)).toEqual([]);
	});

	it("AIB5: missing streaming target is diagnosed and the stream is refused", async () => {
		const { editor, apply, emit } = createStreamEditor({
			hasTarget: false,
		});

		await expect(
			processStream(createStream([{ type: "ping" }]), editor),
		).resolves.toBeUndefined();

		expect(apply).not.toHaveBeenCalled();
		expect(diagnosticsOf(emit)).toEqual([
			expect.objectContaining({
				code: "stream-target-missing",
				source: "delta-stream",
			}),
		]);
	});

	it("AIB5: inbound tool-output is handled without applying document ops", async () => {
		const { editor, apply, emit } = createStreamEditor();
		const onPart = vi.fn();

		await expect(
			processStream(
				createStream([
					{
						type: "tool-output",
						toolCallId: "tool-1",
						output: { ok: true },
					},
				]),
				editor,
				{ onPart },
			),
		).resolves.toBeUndefined();

		expect(onPart).toHaveBeenCalledWith({
			type: "tool-output",
			toolCallId: "tool-1",
			output: { ok: true },
		});
		expect(apply).not.toHaveBeenCalled();
		expect(diagnosticsOf(emit)).toEqual([]);
	});

	it("AIB5: inbound tool-error is diagnosed without throwing or applying", async () => {
		const { editor, apply, emit } = createStreamEditor();
		const onPart = vi.fn();

		await expect(
			processStream(
				createStream([
					{
						type: "tool-error",
						toolCallId: "tool-1",
						error: "search failed",
					},
				]),
				editor,
				{ onPart },
			),
		).resolves.toBeUndefined();

		expect(onPart).toHaveBeenCalledWith({
			type: "tool-error",
			toolCallId: "tool-1",
			error: "search failed",
		});
		expect(apply).not.toHaveBeenCalled();
		expect(diagnosticsOf(emit)).toEqual([
			expect.objectContaining({
				code: "stream-tool-error",
				message: "search failed",
				toolCallId: "tool-1",
			}),
		]);
	});

	it("AIB5: tool-output and tool-error emitted by processStream can be fed back", async () => {
		const { editor, apply } = createStreamEditor({
			toolRuntime: {
				executeTool: vi.fn(async function* () {
					yield { chunk: "one" };
				}),
			},
		});
		const emitted: PenStreamPart[] = [];

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
			{ onPart: (part) => emitted.push(part) },
		);

		const replayed = emitted.filter(
			(part) => part.type === "tool-output" || part.type === "tool-error",
		);
		expect(replayed.length).toBeGreaterThan(0);

		await expect(
			processStream(createStream(replayed), editor),
		).resolves.toBeUndefined();
		expect(apply).not.toHaveBeenCalled();
	});

	it("AIB5: layout-update applies set-props carrying the layout prop", async () => {
		const { editor, apply } = createStreamEditor();

		await processStream(
			createStream([
				{
					type: "layout-update",
					blockId: "block-1",
					layout: { display: "flex" },
				},
			]),
			editor,
			{
				groupId: "turn-1",
				allowedMutatingTools: ["update_block"],
			},
		);

		expect(apply).toHaveBeenCalledWith(
			[
				{
					type: "set-props",
					blockId: "block-1",
					props: { layout: { display: "flex" } },
				},
			],
			{
				origin: { type: "ai", groupId: "turn-1" },
				groupId: "turn-1",
				undoGroupId: "turn-1",
			},
		);
	});

	it("AIB5: app-create, app-update, and app-delete apply corresponding ops", async () => {
		const { editor, apply } = createStreamEditor();

		await processStream(
			createStream([
				{
					type: "app-create",
					appId: "app-1",
					appType: "counter",
					config: { n: 1 },
					placement: { mode: "inline", blockId: "block-1", index: 0 },
				},
				{
					type: "app-update",
					appId: "app-1",
					patch: { n: 2 },
				},
				{
					type: "app-delete",
					appId: "app-1",
				},
			]),
			editor,
			{
				groupId: "turn-1",
				allowedMutatingTools: [
					"create_app",
					"update_app",
					"delete_app",
				],
			},
		);

		expect(appliedOpKinds(apply)).toEqual([
			"app:create",
			"app:update",
			"app:delete",
		]);
		for (const [, options] of apply.mock.calls) {
			expect(options?.undoGroupId).toBe("turn-1");
		}
	});

	it("AIB5: step-start and step-end are observed without document mutation", async () => {
		const { editor, apply } = createStreamEditor();
		const onPart = vi.fn();

		await processStream(
			createStream([
				{ type: "step-start", stepIndex: 0, label: "search" },
				{ type: "step-end", stepIndex: 0 },
			]),
			editor,
			{ onPart },
		);

		expect(onPart).toHaveBeenCalledTimes(2);
		expect(apply).not.toHaveBeenCalled();
	});

	it("AIB5: tool-input-start and tool-input-delta wait for tool-input-available", async () => {
		const { editor, apply } = createStreamEditor();
		const onPart = vi.fn();

		await processStream(
			createStream([
				{
					type: "tool-input-start",
					toolCallId: "tool-1",
					toolName: "search_document",
				},
				{
					type: "tool-input-delta",
					toolCallId: "tool-1",
					inputDelta: '{"q":"',
				},
			]),
			editor,
			{ onPart },
		);

		expect(onPart).toHaveBeenCalledTimes(2);
		expect(apply).not.toHaveBeenCalled();
	});

	it("AIB5: DataPart is an explicit pass-through", async () => {
		const { editor, apply, emit } = createStreamEditor();
		const onPart = vi.fn();
		const dataPart = {
			type: "data-custom" as const,
			data: { marker: true },
		};

		await processStream(createStream([dataPart]), editor, { onPart });

		expect(onPart).toHaveBeenCalledWith(dataPart);
		expect(apply).not.toHaveBeenCalled();
		expect(diagnosticsOf(emit)).toEqual([]);
	});

	it("AIB5: unknown part types diagnose once per type and are not applied", async () => {
		const { editor, apply, emit } = createStreamEditor();
		const unknownA = { type: "future-a" } as unknown as PenStreamPart;
		const unknownB = { type: "future-b" } as unknown as PenStreamPart;

		await processStream(
			createStream([unknownA, unknownA, unknownB]),
			editor,
		);

		expect(apply).not.toHaveBeenCalled();
		expect(diagnosticsOf(emit)).toEqual([
			expect.objectContaining({
				code: "stream-part-unknown",
				partType: "future-a",
			}),
			expect.objectContaining({
				code: "stream-part-unknown",
				partType: "future-b",
			}),
		]);
	});

	it("AIB5: malformed part sequence diagnoses, does not throw, and skips later applies", async () => {
		const { editor, apply, emit } = createStreamEditor();

		await expect(
			processStream(
				createStream([
					{
						type: "block-insert",
						blockId: "block-2",
						blockType: "paragraph",
						position: "last",
					},
					{
						type: "block-update",
						blockId: "",
						props: { text: "nope" },
					},
					{
						type: "block-insert",
						blockId: "block-3",
						blockType: "paragraph",
						position: "last",
					},
				]),
				editor,
				{
					groupId: "turn-1",
					allowedMutatingTools: ["insert_block"],
				},
			),
		).resolves.toBeUndefined();

		expect(apply).toHaveBeenCalledTimes(1);
		expect(apply.mock.calls[0]?.[0][0]).toMatchObject({
			type: "insert-block",
			blockId: "block-2",
		});
		expect(diagnosticsOf(emit)).toEqual([
			expect.objectContaining({
				code: "stream-part-malformed",
				groupId: "turn-1",
			}),
		]);
	});

	it("AIB5: out-of-order gen-delta diagnoses and closes without throwing", async () => {
		const { editor, apply, emit, streamingTarget } = createStreamEditor();

		await expect(
			processStream(
				createStream([
					{ type: "gen-delta", zoneId: "zone-1", delta: "hello" },
					{
						type: "block-insert",
						blockId: "block-2",
						blockType: "paragraph",
						position: "last",
					},
				]),
				editor,
			),
		).resolves.toBeUndefined();

		expect(streamingTarget.appendDelta).not.toHaveBeenCalled();
		expect(apply).not.toHaveBeenCalled();
		expect(diagnosticsOf(emit)).toEqual([
			expect.objectContaining({
				code: "stream-part-out-of-order",
			}),
		]);
	});

	it("AIB5: abort mid-stream stops further applies and cancels generation", async () => {
		const { editor, apply, emit, streamingTarget } = createStreamEditor();

		await processStream(
			createStream([
				{ type: "gen-start", zoneId: "zone-1", blockId: "block-1" },
				{
					type: "block-insert",
					blockId: "block-2",
					blockType: "paragraph",
					position: "last",
				},
				{ type: "abort", reason: "user-cancel" },
				{
					type: "block-insert",
					blockId: "block-3",
					blockType: "paragraph",
					position: "last",
				},
			]),
			editor,
			{
				groupId: "turn-1",
				allowedMutatingTools: ["insert_block"],
			},
		);

		expect(streamingTarget.beginStreaming).toHaveBeenCalledWith(
			"zone-1",
			"block-1",
			{ type: "ai", groupId: "turn-1" },
		);

		expect(apply).toHaveBeenCalledTimes(1);
		expect(apply.mock.calls[0]?.[1]).toEqual({
			origin: { type: "ai", groupId: "turn-1" },
			groupId: "turn-1",
			undoGroupId: "turn-1",
		});
		expect(streamingTarget.endStreaming).toHaveBeenCalledWith("cancelled");
		expect(diagnosticsOf(emit)).toEqual([
			expect.objectContaining({
				code: "stream-aborted",
				groupId: "turn-1",
			}),
		]);
	});

	it("AIB5: abort without groupId documents the undo-group gap", async () => {
		const { editor, apply, emit } = createStreamEditor();

		await processStream(
			createStream([
				{
					type: "block-insert",
					blockId: "block-2",
					blockType: "paragraph",
					position: "last",
				},
				{ type: "abort", reason: "user-cancel" },
			]),
			editor,
			{ allowedMutatingTools: ["insert_block"] },
		);

		expect(apply).toHaveBeenCalledWith(expect.any(Array), { origin: "ai" });
		expect(diagnosticsOf(emit)).toEqual([
			expect.objectContaining({
				code: "stream-aborted",
				groupId: null,
			}),
		]);
		expect(String(diagnosticsOf(emit)[0]?.message)).toMatch(/no groupId/);
	});

	it("AIB5: signal abort leaves landed ops and cancels generation", async () => {
		const { editor, apply, emit, streamingTarget } = createStreamEditor();
		const controller = new AbortController();

		await processStream(
			(async function* () {
				yield {
					type: "gen-start",
					zoneId: "zone-1",
					blockId: "block-1",
				} satisfies PenStreamPart;
				yield {
					type: "block-insert",
					blockId: "block-2",
					blockType: "paragraph",
					position: "last",
				} satisfies PenStreamPart;
				controller.abort();
				yield {
					type: "block-insert",
					blockId: "block-3",
					blockType: "paragraph",
					position: "last",
				} satisfies PenStreamPart;
			})(),
			editor,
			{
				signal: controller.signal,
				groupId: "turn-1",
				allowedMutatingTools: ["insert_block"],
			},
		);

		expect(apply).toHaveBeenCalledTimes(1);
		expect(streamingTarget.endStreaming).toHaveBeenCalledWith("cancelled");
		expect(diagnosticsOf(emit)).toEqual([
			expect.objectContaining({
				code: "stream-aborted",
				groupId: "turn-1",
			}),
		]);
	});

	it("AIB5: a part without a string type is malformed, does not throw, and closes the stream", async () => {
		const { editor, apply, emit } = createStreamEditor();

		await expect(
			processStream(
				createStream([
					{} as PenStreamPart,
					{
						type: "block-insert",
						blockId: "block-2",
						blockType: "paragraph",
						position: "last",
					},
				]),
				editor,
			),
		).resolves.toBeUndefined();

		expect(apply).not.toHaveBeenCalled();
		expect(diagnosticsOf(emit)).toEqual([
			expect.objectContaining({
				code: "stream-part-malformed",
			}),
		]);
	});

	it("AIB5: each formerly inert part is handled or observed without throwing", async () => {
		const { editor, apply } = createStreamEditor();
		const formerlyInert: PenStreamPart[] = [
			{
				type: "app-create",
				appId: "app-1",
				appType: "counter",
				config: {},
				placement: { mode: "inline", blockId: "block-1", index: 0 },
			},
			{ type: "app-update", appId: "app-1", patch: { n: 1 } },
			{ type: "app-delete", appId: "app-1" },
			{
				type: "layout-update",
				blockId: "block-1",
				layout: { display: "grid" },
			},
			{ type: "step-start", stepIndex: 1 },
			{ type: "step-end", stepIndex: 1 },
			{
				type: "tool-input-start",
				toolCallId: "t1",
				toolName: "search_document",
			},
			{ type: "tool-input-delta", toolCallId: "t1", inputDelta: "{" },
			{ type: "tool-output", toolCallId: "t1", output: null },
			{ type: "tool-error", toolCallId: "t1", error: "nope" },
		];

		await expect(
			processStream(createStream(formerlyInert), editor, {
				allowedMutatingTools: [
					"create_app",
					"update_app",
					"delete_app",
					"update_block",
				],
			}),
		).resolves.toBeUndefined();

		expect(appliedOpKinds(apply)).toEqual([
			"app:create",
			"app:update",
			"app:delete",
			"set-props",
		]);
	});
});
