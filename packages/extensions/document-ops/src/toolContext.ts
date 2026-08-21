import {
  generateId,
  type Editor,
  type PenStreamPart,
  type Position,
  type ToolContext,
} from "@input/pen-types";
import { assertToolCanUseBlockType } from "./utils/blockTypePolicy";
import { assertToolCanMutateBlock } from "./utils/mutationPolicy";
import { assertValidToolPayloads } from "./utils/payloadValidation";

export class ToolContextImpl implements ToolContext {
  readonly editor: Editor;
  readonly docId: string;
  private readonly _emitFn: (part: PenStreamPart) => void;
  private _activeStreamingZone:
    | {
        zoneId: string;
        blockId: string;
      }
    | null = null;

  constructor(
    editor: Editor,
    docId: string,
    emitFn: (part: PenStreamPart) => void,
  ) {
    this.editor = editor;
    this.docId = docId;
    this._emitFn = emitFn;
  }

  emit(part: PenStreamPart): void {
    this._emitFn(part);
  }

  insertBlock(
    blockType: string,
    props: Record<string, unknown>,
    position: Position,
  ): string {
    assertToolCanUseBlockType(this.editor, blockType);
    const blockId = generateId();
    const ops = assertValidToolPayloads(this.editor, [
      {
        type: "insert-block",
        blockId,
        blockType,
        props,
        position,
      },
    ]);

    this.editor.apply(ops, { origin: "ai" });

    this.emit({
      type: "block-insert",
      blockId,
      blockType,
      props,
      position,
    });

    return blockId;
  }

  updateBlock(
    blockId: string,
    props: Record<string, unknown>,
  ): void {
    assertToolCanMutateBlock(this.editor, blockId);
    const ops = assertValidToolPayloads(this.editor, [
      { type: "update-block", blockId, props },
    ]);
    this.editor.apply(ops, { origin: "ai" });
    this.emit({
      type: "block-update",
      blockId,
      props,
    });
  }

  deleteBlock(blockId: string): void {
    assertToolCanMutateBlock(this.editor, blockId);
    const ops = assertValidToolPayloads(this.editor, [
      { type: "delete-block", blockId },
    ]);
    this.editor.apply(ops, { origin: "ai" });
    this.emit({
      type: "block-delete",
      blockId,
    });
  }

  beginStreaming(zoneId: string, blockId: string): void {
    this.stopUndoCapture();
    this._activeStreamingZone = { zoneId, blockId };
    this.emit({ type: "gen-start", zoneId, blockId });

    const streaming = this.editor.internals.getSlot<{
      beginStreaming(zoneId: string, blockId: string): void;
    }>("delta-stream:target");
    if (streaming) {
      streaming.beginStreaming(zoneId, blockId);
    }
  }

  appendDelta(delta: string): void {
    const activeZone = this._activeStreamingZone;
    if (!activeZone) {
      throw new Error("appendDelta() called before beginStreaming()");
    }
    this.emit({
      type: "gen-delta",
      zoneId: activeZone.zoneId,
      delta,
    });

    const streaming = this.editor.internals.getSlot<{
      appendDelta(delta: string): void;
    }>("delta-stream:target");
    if (streaming) {
      streaming.appendDelta(delta);
    }
  }

  endStreaming(
    status: "complete" | "cancelled" | "error",
  ): void {
    const activeZone = this._activeStreamingZone;
    if (!activeZone) {
      throw new Error("endStreaming() called before beginStreaming()");
    }
    this.emit({
      type: "gen-end",
      zoneId: activeZone.zoneId,
      status,
    });
    this._activeStreamingZone = null;

    const streaming = this.editor.internals.getSlot<{
      endStreaming(status: "complete" | "cancelled" | "error"): void;
    }>("delta-stream:target");
    if (streaming) {
      streaming.endStreaming(status);
    }
    this.stopUndoCapture();
  }

  private stopUndoCapture(): void {
    const undoManager = (
      this.editor as Editor & {
        undoManager?: { stopCapturing?: () => void };
      }
    ).undoManager;
    undoManager?.stopCapturing?.();
  }
}
