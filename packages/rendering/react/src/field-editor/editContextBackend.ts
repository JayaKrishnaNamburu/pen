import type { InputBackend, Editor } from "@pen/core";
import type { FieldEditorImpl } from "./fieldEditorImpl.js";
import { fullReconcileToDOM, applyDeltaToDOM } from "./reconciler.js";
import { resolveMarksAtPosition } from "./markBoundary.js";
import { getSelectionOffsets } from "./selectionBridge.js";
import { handleFieldEditorKeyDown } from "./keyHandling.js";

declare class EditContext {
  constructor(options?: {
    text?: string;
    selectionStart?: number;
    selectionEnd?: number;
  });
  updateText(start: number, end: number, text: string): void;
  updateSelection(start: number, end: number): void;
  updateCharacterBounds(start: number, rects: DOMRect[]): void;
  addEventListener(type: string, handler: (event: any) => void): void;
  removeEventListener(type: string, handler: (event: any) => void): void;
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

export class EditContextBackend implements InputBackend {
  private editContext: EditContext | null = null;
  private element: HTMLElement | null = null;
  private ytext: any = null;
  private observer: any = null;
  private editor: Editor;
  private fieldEditor: FieldEditorImpl;

  constructor(editor: Editor, fieldEditor: FieldEditorImpl) {
    this.editor = editor;
    this.fieldEditor = fieldEditor;
  }

  activate(element: HTMLElement, ytext: unknown): void {
    this.element = element;
    this.ytext = ytext;

    this.editContext = new (globalThis as any).EditContext({
      text: this.ytext.toString(),
      selectionStart: 0,
      selectionEnd: 0,
    });

    const ec = this.editContext!;

    (
      element as HTMLElement & { editContext: EditContext | null }
    ).editContext = ec;

    element.addEventListener("keydown", this.handleKeyDown);
    ec.addEventListener("textupdate", this.handleTextUpdate);
    ec.addEventListener(
      "textformatupdate",
      this.handleTextFormatUpdate,
    );
    ec.addEventListener(
      "characterboundsupdate",
      this.handleCharacterBoundsUpdate,
    );
    element.ownerDocument?.addEventListener(
      "selectionchange",
      this.handleSelectionChange,
    );

    this.observer = this.ytext.observe((event: any) =>
      this.handleYTextChange(event),
    );

    fullReconcileToDOM(this.ytext, element, this.editor.schema);
  }

  deactivate(): void {
    if (this.editContext) {
      this.editContext.removeEventListener("textupdate", this.handleTextUpdate);
      this.editContext.removeEventListener(
        "textformatupdate",
        this.handleTextFormatUpdate,
      );
      this.editContext.removeEventListener(
        "characterboundsupdate",
        this.handleCharacterBoundsUpdate,
      );
    }
    if (this.observer && this.ytext) {
      this.ytext.unobserve(this.observer);
    }
    if (this.element) {
      this.element.removeEventListener("keydown", this.handleKeyDown);
      this.element.ownerDocument?.removeEventListener(
        "selectionchange",
        this.handleSelectionChange,
      );
      (
        this.element as HTMLElement & { editContext: EditContext | null }
      ).editContext = null;
    }
    this.editContext = null;
    this.element = null;
    this.ytext = null;
    this.observer = null;
  }

  updateSelection(_relPos: unknown): void {
    if (!this.editContext || !this.ytext) return;

    const selection = this.fieldEditor.selection;
    const blockId = this.fieldEditor.activeBlockId;
    if (
      selection?.type === "text" &&
      blockId &&
      selection.anchor.blockId === blockId &&
      selection.focus.blockId === blockId
    ) {
      this.editContext.updateSelection(
        selection.anchor.offset,
        selection.focus.offset,
      );
      return;
    }

    const len = this.ytext.length;
    this.editContext.updateSelection(len, len);
  }

  private handleTextUpdate = (event: any): void => {
    const {
      updateRangeStart,
      updateRangeEnd,
      text,
      selectionStart,
      selectionEnd,
    } = event;
    const blockId = this.fieldEditor.activeBlockId;
    if (!blockId) return;

    const block = this.editor.getBlock(blockId);
    if (!block) {
      this.fieldEditor.deactivate();
      return;
    }

    this.editor.internals.adapter.transact(
      this.editor.internals.crdtDoc,
      () => {
        if (updateRangeEnd > updateRangeStart) {
          this.ytext.delete(
            updateRangeStart,
            updateRangeEnd - updateRangeStart,
          );
        }
        if (text.length > 0) {
          const marks = resolveMarksAtPosition(
            this.ytext,
            updateRangeStart,
            this.editor.schema,
          );
          this.ytext.insert(updateRangeStart, text, marks);
        }
      },
      "user",
    );

    if (
      typeof selectionStart === "number" &&
      typeof selectionEnd === "number"
    ) {
      this.fieldEditor.syncTextSelection(blockId, selectionStart, selectionEnd);
    }
  };

  private handleTextFormatUpdate = (event: any): void => {
    // IME composition underline rendering.
    // The textformatupdate event provides ranges with underline styles
    // for visual feedback during IME composition. These are rendered
    // as ephemeral decorations (not CRDT marks) and cleared when
    // textupdate confirms the final text.
    if (!this.element) return;

    const ranges = event.getTextFormats?.() ?? [];
    for (const fmt of ranges) {
      const { rangeStart, rangeEnd, underlineStyle, underlineThickness } = fmt;
      if (!underlineStyle) continue;

      // Apply inline decoration-style attributes via mark wrappers.
      // This is a visual-only effect that doesn't modify the CRDT.
      const inlineEls = this.element.querySelectorAll("[data-pen-inline-content]");
      for (const el of inlineEls) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        let offset = 0;
        let textNode: Text | null;
        while ((textNode = walker.nextNode() as Text | null)) {
          const len = textNode.textContent?.length ?? 0;
          const segStart = offset;
          const segEnd = offset + len;
          if (segEnd > rangeStart && segStart < rangeEnd) {
            const parentEl = textNode.parentElement;
            if (parentEl) {
              parentEl.style.textDecoration = underlineStyle;
              if (underlineThickness) {
                parentEl.style.textDecorationThickness = underlineThickness;
              }
            }
          }
          offset += len;
        }
      }
    }
  };

  private handleCharacterBoundsUpdate = (event: any): void => {
    if (!this.element || !this.editContext) return;

    const { rangeStart, rangeEnd } = event;
    const rects: DOMRect[] = [];

    for (let i = rangeStart; i < rangeEnd; i++) {
      const rect = getCharacterRect(this.element, i);
      rects.push(rect);
    }

    this.editContext.updateCharacterBounds(rangeStart, rects);
  };

  private handleSelectionChange = (): void => {
    if (!this.element || !this.editContext) return;

    const blockId = this.fieldEditor.activeBlockId;
    if (!blockId) return;

    const selection = this.element.ownerDocument?.getSelection();
    if (!selection?.rangeCount) return;
    if (!this.element.contains(selection.anchorNode)) return;
    if (!this.element.contains(selection.focusNode)) return;

    const offsets = getSelectionOffsets(this.element);
    if (!offsets) return;

    this.editContext.updateSelection(offsets.start, offsets.end);
    this.fieldEditor.syncTextSelection(blockId, offsets.start, offsets.end);
  };

  private handleYTextChange = (event: any): void => {
    if (!this.editContext || !this.element) return;

    const delta = event.delta as {
      retain?: number;
      insert?: string;
      delete?: number;
    }[];
    let offset = 0;
    for (const entry of delta) {
      if (entry.retain != null) {
        offset += entry.retain;
      } else if (typeof entry.insert === "string") {
        this.editContext.updateText(offset, offset, entry.insert);
        offset += entry.insert.length;
      } else if (entry.delete != null) {
        this.editContext.updateText(offset, offset + entry.delete, "");
      }
    }

    const applied = applyDeltaToDOM(
      event.delta,
      this.element,
      this.editor.schema,
    );
    if (!applied) {
      fullReconcileToDOM(this.ytext, this.element, this.editor.schema);
    }

    this.restoreDOMCaret();
  };

  private restoreDOMCaret(): void {
    if (!this.editContext || !this.element) return;

    const start = this.editContext.selectionStart;
    const end = this.editContext.selectionEnd;

    const anchorPoint = findTextPosition(this.element, start);
    const focusPoint = start === end ? anchorPoint : findTextPosition(this.element, end);
    if (!anchorPoint || !focusPoint) return;

    const sel = this.element.ownerDocument?.getSelection();
    if (!sel) return;

    sel.removeAllRanges();
    const range = document.createRange();
    range.setStart(anchorPoint.node, anchorPoint.offset);
    range.setEnd(focusPoint.node, focusPoint.offset);
    sel.addRange(range);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.editContext || !this.element || !this.ytext) return;

    const handled = handleFieldEditorKeyDown({
      event,
      editor: this.editor,
      fieldEditor: this.fieldEditor,
      ytext: this.ytext,
      range: {
        start: Math.min(
          this.editContext.selectionStart,
          this.editContext.selectionEnd,
        ),
        end: Math.max(
          this.editContext.selectionStart,
          this.editContext.selectionEnd,
        ),
      },
    });
    if (handled) {
      event.preventDefault();
    }
  };
}

/**
 * Get the DOMRect for a character at the given offset within the element.
 * Walks text nodes to locate the character, then uses Range.getBoundingClientRect().
 */
function getCharacterRect(element: HTMLElement, charOffset: number): DOMRect {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  let remaining = charOffset;
  let textNode: Text | null;

  while ((textNode = walker.nextNode() as Text | null)) {
    const len = textNode.textContent?.length ?? 0;
    if (remaining < len) {
      const range = document.createRange();
      range.setStart(textNode, remaining);
      range.setEnd(textNode, remaining + 1);
      return range.getBoundingClientRect();
    }
    remaining -= len;
  }

  // Fallback: return the element's bounding rect
  return element.getBoundingClientRect();
}

function findTextPosition(
  container: HTMLElement,
  charOffset: number,
): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let remaining = charOffset;
  let textNode: Text | null;

  while ((textNode = walker.nextNode() as Text | null)) {
    const len = textNode.textContent?.length ?? 0;
    if (remaining <= len) {
      return { node: textNode, offset: remaining };
    }
    remaining -= len;
  }

  const last = container.lastChild;
  if (last) {
    return { node: last, offset: last.textContent?.length ?? 0 };
  }
  return { node: container, offset: 0 };
}
