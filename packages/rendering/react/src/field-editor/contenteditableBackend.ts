import type { InputBackend, Editor, DocumentOp } from "@pen/core";
import type { FieldEditorImpl } from "./fieldEditorImpl.js";
import {
  fullReconcileToDOM,
  applyDeltaToDOM,
} from "./reconciler.js";
import { resolveMarksAtPosition } from "./markBoundary.js";
import {
  computeTextDiff,
  domSelectionToEditor,
  extractTextFromDOM,
  getSelectionOffsets,
} from "./selectionBridge.js";
import type { PasteImporters } from "../context/editorContext.js";
import { handlePaste, handleCopy, handleCut } from "./clipboard.js";
import { applyEnterBehavior } from "./commands.js";
import { handleFieldEditorKeyDown } from "./keyHandling.js";

export class ContentEditableBackend implements InputBackend {
  private element: HTMLElement | null = null;
  private ytext: any = null;
  private observer: any = null;
  private mutationObserver: MutationObserver | null = null;
  private isComposing = false;
  private compositionStartTimestamp = 0;
  private deferredRemoteDeltas: Array<{ delta: any[] }> = [];
  private editor: Editor;
  private fieldEditor: FieldEditorImpl;

  constructor(editor: Editor, fieldEditor: FieldEditorImpl) {
    this.editor = editor;
    this.fieldEditor = fieldEditor;
  }

  activate(element: HTMLElement, ytext: unknown): void {
    this.element = element;
    this.ytext = ytext;

    element.contentEditable = "true";

    element.addEventListener("beforeinput", this.handleBeforeInput);
    element.addEventListener("compositionstart", this.handleCompositionStart);
    element.addEventListener("compositionend", this.handleCompositionEnd);
    element.addEventListener("keydown", this.handleKeyDown);
    element.addEventListener("copy", this.handleCopyEvent);
    element.addEventListener("cut", this.handleCutEvent);
    element.ownerDocument?.addEventListener(
      "selectionchange",
      this.handleSelectionChange,
    );

    this.mutationObserver = new MutationObserver(this.handleMutations);
    this.mutationObserver.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true,
    });

    this.observer = this.ytext.observe((event: any) =>
      this.handleYTextChange(event),
    );

    fullReconcileToDOM(this.ytext, element, this.editor.schema);
  }

  deactivate(): void {
    if (this.element) {
      this.element.contentEditable = "false";
      this.element.removeEventListener("beforeinput", this.handleBeforeInput);
      this.element.removeEventListener(
        "compositionstart",
        this.handleCompositionStart,
      );
      this.element.removeEventListener(
        "compositionend",
        this.handleCompositionEnd,
      );
      this.element.removeEventListener("keydown", this.handleKeyDown);
      this.element.removeEventListener("copy", this.handleCopyEvent);
      this.element.removeEventListener("cut", this.handleCutEvent);
      this.element.ownerDocument?.removeEventListener(
        "selectionchange",
        this.handleSelectionChange,
      );
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    if (this.observer && this.ytext) {
      this.ytext.unobserve(this.observer);
    }
    this.element = null;
    this.ytext = null;
    this.observer = null;
    this.deferredRemoteDeltas = [];
  }

  updateSelection(_relPos: unknown): void {
    // CRDT relative position → DOM selection is handled by editorSelectionToDOM
    // in the selection-bridge module. This method is reserved for external callers
    // (e.g., remote cursor updates).
  }

  // ── Mode 1: Direct ────────────────────────────────────────

  private handleBeforeInput = (event: InputEvent): void => {
    if (this.isComposing) return;

    const blockId = this.fieldEditor.activeBlockId;
    if (!blockId || !this.editor.getBlock(blockId)) {
      this.fieldEditor.deactivate();
      return;
    }

    const handler = DIRECT_HANDLERS[event.inputType];
    if (handler) {
      event.preventDefault();
      handler(event, this.editor, this.ytext, this.fieldEditor, this.element!);
      return;
    }

    // Unrecognized inputType → Mode 3 (let mutation observer handle it)
  };

  // ── Mode 2: Composition ───────────────────────────────────

  private handleCompositionStart = (): void => {
    this.isComposing = true;
    this.compositionStartTimestamp = Date.now();
  };

  private handleCompositionEnd = (): void => {
    this.isComposing = false;

    const elapsed = Date.now() - this.compositionStartTimestamp;

    // GBoard rapid composition optimization: skip full diff for single-char
    // compositions under 50ms — treat as direct insert.
    if (elapsed < 50 && this.element) {
      const domText = extractTextFromDOM(this.element);
      const crdtText = this.ytext?.toString() ?? "";
      if (Math.abs(domText.length - crdtText.length) <= 1) {
        this.reconcileAfterComposition();
        return;
      }
    }

    // Safari may fire compositionend before the final DOM mutation.
    requestAnimationFrame(() => {
      if (this.isComposing) return;
      this.reconcileAfterComposition();
    });
  };

  private reconcileAfterComposition(): void {
    if (!this.element || !this.ytext) return;

    const domText = extractTextFromDOM(this.element);
    const crdtText = this.ytext.toString();

    if (domText !== crdtText) {
      const diff = computeTextDiff(crdtText, domText);
      this.editor.internals.adapter.transact(
        this.editor.internals.crdtDoc,
        () => {
          for (const op of diff) {
            if (op.type === "delete") {
              this.ytext.delete(op.offset, op.length);
            } else if (op.type === "insert") {
              const marks = resolveMarksAtPosition(
                this.ytext,
                op.offset,
                this.editor.schema,
              );
              this.ytext.insert(op.offset, op.text, marks);
            }
          }
        },
        "user",
      );
    }

    if (this.deferredRemoteDeltas.length > 0) {
      this.deferredRemoteDeltas = [];
      fullReconcileToDOM(this.ytext, this.element!, this.editor.schema);
    }
  }

  // ── Mode 3: Observation ───────────────────────────────────

  private handleMutations = (_mutations: MutationRecord[]): void => {
    if (this.isComposing) return;
    if (!this.element || !this.ytext) return;

    const domText = extractTextFromDOM(this.element);
    const crdtText = this.ytext.toString();

    if (domText !== crdtText) {
      const diff = computeTextDiff(crdtText, domText);
      this.editor.internals.adapter.transact(
        this.editor.internals.crdtDoc,
        () => {
          for (const op of diff) {
            if (op.type === "delete") {
              this.ytext.delete(op.offset, op.length);
            } else if (op.type === "insert") {
              const marks = resolveMarksAtPosition(
                this.ytext,
                op.offset,
                this.editor.schema,
              );
              this.ytext.insert(op.offset, op.text, marks);
            }
          }
        },
        "user",
      );
    }
  };

  // ── CRDT→DOM reconciliation ───────────────────────────────

  private handleYTextChange = (event: any): void => {
    if (this.isComposing) {
      if (
        event.transaction?.origin === "remote" ||
        event.transaction?.origin === "collaborator"
      ) {
        this.deferredRemoteDeltas.push({ delta: event.delta });
      }
      return;
    }

    if (!this.element || !this.ytext) return;

    const applied = applyDeltaToDOM(
      event.delta,
      this.element,
      this.editor.schema,
    );
    if (!applied) {
      fullReconcileToDOM(this.ytext, this.element, this.editor.schema);
    }
  };

  // ── Keyboard shortcuts ────────────────────────────────────

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.ytext) return;

    const handled = handleFieldEditorKeyDown({
      event,
      editor: this.editor,
      fieldEditor: this.fieldEditor,
      ytext: this.ytext,
      range: this.element ? getSelectionOffsets(this.element) : null,
    });
    if (handled) {
      event.preventDefault();
      return;
    }
  };

  private handleSelectionChange = (): void => {
    if (!this.element) return;

    const root = this.element.closest("[data-pen-editor-root]") as
      | HTMLElement
      | null;
    if (!root) return;

    const selection = domSelectionToEditor(root);
    if (!selection) return;
    if (selection.anchor.blockId !== selection.focus.blockId) return;

    this.fieldEditor.syncTextSelection(
      selection.anchor.blockId,
      selection.anchor.offset,
      selection.focus.offset,
    );
  };

  // ── Clipboard events ──────────────────────────────────────

  private handleCopyEvent = (event: ClipboardEvent): void => {
    event.preventDefault();
    handleCopy(this.editor);
  };

  private handleCutEvent = (event: ClipboardEvent): void => {
    event.preventDefault();
    handleCut(this.editor);
  };
}

// ── Direct input handlers ──────────────────────────────────

type DirectHandler = (
  event: InputEvent,
  editor: Editor,
  ytext: any,
  fieldEditor: FieldEditorImpl,
  element: HTMLElement,
) => void;

const DIRECT_HANDLERS: Record<string, DirectHandler> = {
  insertText: (event, editor, ytext, _fe, element) => {
    const text = event.data ?? "";
    if (!text) return;
    const range = getSelectionOffsets(element);
    if (!range) return;

    editor.internals.adapter.transact(
      editor.internals.crdtDoc,
      () => {
        if (range.start !== range.end) {
          ytext.delete(range.start, range.end - range.start);
        }
        const marks = resolveMarksAtPosition(
          ytext,
          range.start,
          editor.schema,
        );
        ytext.insert(range.start, text, marks);
      },
      "user",
    );
  },

  insertReplacementText: (event, editor, ytext, _fe, element) => {
    const text = event.data ?? "";
    if (!text) return;
    const targetRanges = event.getTargetRanges?.();
    const range = targetRanges?.length
      ? staticRangeToOffsets(targetRanges[0], element)
      : getSelectionOffsets(element);
    if (!range) return;

    editor.internals.adapter.transact(
      editor.internals.crdtDoc,
      () => {
        if (range.start !== range.end) {
          ytext.delete(range.start, range.end - range.start);
        }
        const marks = resolveMarksAtPosition(
          ytext,
          range.start,
          editor.schema,
        );
        ytext.insert(range.start, text, marks);
      },
      "user",
    );
  },

  deleteContentBackward: (_event, editor, ytext, _fe, element) => {
    const range = getSelectionOffsets(element);
    if (!range) return;

    editor.internals.adapter.transact(
      editor.internals.crdtDoc,
      () => {
        if (range.start !== range.end) {
          ytext.delete(range.start, range.end - range.start);
        } else if (range.start > 0) {
          ytext.delete(range.start - 1, 1);
        } else {
          // Backspace at block start — merge with previous block
          const blockId = _fe.activeBlockId;
          if (blockId) {
            const block = editor.getBlock(blockId);
            if (block?.prev) {
              editor.apply([
                {
                  type: "merge-blocks",
                  targetBlockId: block.prev.id,
                  sourceBlockId: blockId,
                } as DocumentOp,
              ]);
            }
          }
        }
      },
      "user",
    );
  },

  deleteContentForward: (_event, editor, ytext, _fe, element) => {
    const range = getSelectionOffsets(element);
    if (!range) return;

    editor.internals.adapter.transact(
      editor.internals.crdtDoc,
      () => {
        if (range.start !== range.end) {
          ytext.delete(range.start, range.end - range.start);
        } else if (range.start < ytext.length) {
          ytext.delete(range.start, 1);
        }
      },
      "user",
    );
  },

  deleteByCut: (_event, editor, ytext, _fe, element) => {
    const range = getSelectionOffsets(element);
    if (!range || range.start === range.end) return;

    editor.internals.adapter.transact(
      editor.internals.crdtDoc,
      () => {
        ytext.delete(range.start, range.end - range.start);
      },
      "user",
    );
  },

  deleteWordBackward: (_event, editor, ytext, _fe, element) => {
    const range = getSelectionOffsets(element);
    if (!range) return;

    if (range.start !== range.end) {
      editor.internals.adapter.transact(
        editor.internals.crdtDoc,
        () => ytext.delete(range.start, range.end - range.start),
        "user",
      );
      return;
    }

    const text = ytext.toString();
    let pos = range.start;
    while (pos > 0 && /\s/.test(text[pos - 1])) pos--;
    while (pos > 0 && !/\s/.test(text[pos - 1])) pos--;
    if (pos < range.start) {
      editor.internals.adapter.transact(
        editor.internals.crdtDoc,
        () => ytext.delete(pos, range.start - pos),
        "user",
      );
    }
  },

  deleteWordForward: (_event, editor, ytext, _fe, element) => {
    const range = getSelectionOffsets(element);
    if (!range) return;

    if (range.start !== range.end) {
      editor.internals.adapter.transact(
        editor.internals.crdtDoc,
        () => ytext.delete(range.start, range.end - range.start),
        "user",
      );
      return;
    }

    const text = ytext.toString();
    let pos = range.end;
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    while (pos < text.length && !/\s/.test(text[pos])) pos++;
    if (pos > range.end) {
      editor.internals.adapter.transact(
        editor.internals.crdtDoc,
        () => ytext.delete(range.end, pos - range.end),
        "user",
      );
    }
  },

  insertParagraph: (_event, editor, ytext, fe, element) => {
    const blockId = fe.activeBlockId;
    if (!blockId) return;
    const target = applyEnterBehavior(editor, {
      blockId,
      inputMode: fe.inputMode,
      ytext,
      range: getSelectionOffsets(element),
    });
    if (!target) return;

    fe.activateTextSelection(
      target.blockId,
      target.anchorOffset,
      target.focusOffset,
    );
  },

  insertLineBreak: (_event, editor, ytext, _fe, element) => {
    const range = getSelectionOffsets(element);
    if (!range) return;

    editor.internals.adapter.transact(
      editor.internals.crdtDoc,
      () => {
        if (range.start !== range.end) {
          ytext.delete(range.start, range.end - range.start);
        }
        ytext.insert(range.start, "\n");
      },
      "user",
    );
  },

  historyUndo: (_event, editor) => {
    editor.undoManager.undo();
  },

  historyRedo: (_event, editor) => {
    editor.undoManager.redo();
  },

  insertFromPaste: (event, editor, _ytext, fe) => {
    const importers = editor.internals.getSlot<PasteImporters>("paste:importers");
    handlePaste(event, editor, fe, importers ?? undefined);
  },

  formatBold: (_event, editor, ytext, _fe, element) => {
    applyFormatToggle(editor, ytext, element, "bold", true);
  },

  formatItalic: (_event, editor, ytext, _fe, element) => {
    applyFormatToggle(editor, ytext, element, "italic", true);
  },

  formatUnderline: (_event, editor, ytext, _fe, element) => {
    applyFormatToggle(editor, ytext, element, "underline", true);
  },

  formatStrikeThrough: (_event, editor, ytext, _fe, element) => {
    applyFormatToggle(editor, ytext, element, "strikethrough", true);
  },
};

function applyFormatToggle(
  editor: Editor,
  ytext: any,
  element: HTMLElement,
  markType: string,
  _value: unknown,
): void {
  const range = getSelectionOffsets(element);
  if (!range || range.start === range.end) return;

  const deltas = ytext.toDelta();
  let offset = 0;
  let hasMarkInRange = false;
  for (const d of deltas) {
    const len = typeof d.insert === "string" ? d.insert.length : 1;
    const segEnd = offset + len;
    if (segEnd > range.start && offset < range.end) {
      if (d.attributes?.[markType]) {
        hasMarkInRange = true;
        break;
      }
    }
    offset += len;
  }

  editor.internals.adapter.transact(
    editor.internals.crdtDoc,
    () => {
      ytext.format(
        range.start,
        range.end - range.start,
        { [markType]: hasMarkInRange ? null : true },
      );
    },
    "user",
  );
}

/**
 * Convert a StaticRange (from getTargetRanges) to character offsets
 * within the inline content element.
 */
function staticRangeToOffsets(
  staticRange: StaticRange,
  element: HTMLElement,
): { start: number; end: number } | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  let charOffset = 0;
  let startOffset = -1;
  let endOffset = -1;
  let textNode: Text | null;

  while ((textNode = walker.nextNode() as Text | null)) {
    const len = textNode.textContent?.length ?? 0;

    if (textNode === staticRange.startContainer) {
      startOffset = charOffset + staticRange.startOffset;
    }
    if (textNode === staticRange.endContainer) {
      endOffset = charOffset + staticRange.endOffset;
    }

    charOffset += len;
    if (startOffset >= 0 && endOffset >= 0) break;
  }

  if (startOffset < 0 || endOffset < 0) return null;
  return {
    start: Math.min(startOffset, endOffset),
    end: Math.max(startOffset, endOffset),
  };
}

