import type { Editor, Extension } from "@input/pen-types";
import { StreamingTargetImpl } from "./streamingTarget";
import type { DocumentOp, GenerationZone } from "@input/pen-types";

export interface DeltaStreamOptions {
	batchInterval?: number;
}

export function deltaStreamExtension(options?: DeltaStreamOptions): Extension {
	let editor: Editor | null = null;
	let streamingTarget: StreamingTargetImpl | null = null;
	let unsubscribeApplyBoundary: (() => void) | null = null;
	let isolatingApply = false;

	return {
		name: "delta-stream",
		version: "0.0.0",

		activateClient: async (ctx) => {
			editor = ctx.editor;
			streamingTarget = new StreamingTargetImpl(
				ctx.editor,
				options?.batchInterval,
			);

			ctx.editor.internals.assignSlot(
				"delta-stream:target",
				streamingTarget,
			);

			unsubscribeApplyBoundary = ctx.editor.internals.onApplyBoundary(
				(event) => {
					if (event.phase === "before") {
						const activeBlockId =
							getActiveGenerationBlockId(streamingTarget);
						isolatingApply =
							event.origin === "user" &&
							activeBlockId !== null &&
							targetsOutsideGenerationZone(
								event.ops,
								activeBlockId,
							);

						if (isolatingApply) {
							ctx.editor.undoManager.stopCapturing();
						}
						return;
					}

					if (isolatingApply) {
						ctx.editor.undoManager.stopCapturing();
						isolatingApply = false;
					}
				},
			);
		},

		deactivateClient: async () => {
			unsubscribeApplyBoundary?.();
			unsubscribeApplyBoundary = null;
			isolatingApply = false;

			if (streamingTarget?.generationZone) {
				streamingTarget.endStreaming("error");
			}
			editor?.internals.assignSlot("delta-stream:target", undefined);
			editor = null;
			streamingTarget = null;
		},
	};
}

function getActiveGenerationBlockId(
	streamingTarget: { generationZone: GenerationZone | null } | null,
): string | null {
	return streamingTarget?.generationZone?.blockId ?? null;
}

function targetsOutsideGenerationZone(
	ops: readonly DocumentOp[],
	activeBlockId: string,
): boolean {
	for (const op of ops) {
		const targetBlockId =
			"blockId" in op
				? op.blockId
				: "targetBlockId" in op
					? op.targetBlockId
					: null;

		if (targetBlockId && targetBlockId !== activeBlockId) {
			return true;
		}
	}

	return false;
}
