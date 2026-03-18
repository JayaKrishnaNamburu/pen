import { FieldEditorImpl } from "@pen/dom";
import {
  handleHistoryShortcut,
  handleSelectAllShortcut,
} from "@pen/dom/field-editor/keyHandling";
import { getAdjacentVisibleBlockId } from "@pen/dom/utils/parentIdTree";
import { DATA_ATTRS } from "@pen/dom/utils/dataAttributes";
import {
  delegatesToGridEditing,
  usesInlineTextSelection,
} from "@pen/types";
import type { AssetProvider, CellSelection, Editor } from "@pen/types";
import { FIELD_EDITOR_SLOT_KEY as CORE_FIELD_EDITOR_SLOT_KEY } from "@pen/types";
import {
  defineComponent,
  h,
  mergeProps,
  onBeforeUnmount,
  ref,
  toRef,
  watch,
  type ComponentPublicInstance,
  type PropType,
} from "vue";
import { FIELD_EDITOR_SLOT_KEY } from "../constants/fieldEditor";
import { useDocumentEmptyState } from "../internal/editorState";
import { provideEditorContext } from "../internal/editorContext";
import {
  provideFieldEditorContext,
  type VueFieldEditor,
} from "../internal/fieldEditorContext";
import type { PasteImporters, RendererOverrides } from "../types";
import { PenContent } from "./PenContent";

export const PenEditor = defineComponent({
  name: "PenEditor",
  props: {
    editor: {
      type: Object as PropType<Editor>,
      required: true,
    },
    readonly: {
      type: Boolean,
      default: false,
    },
    importers: {
      type: Object as PropType<PasteImporters | undefined>,
      default: undefined,
    },
    assets: {
      type: Object as PropType<AssetProvider | undefined>,
      default: undefined,
    },
    emptyPlaceholder: {
      type: String,
      default: undefined,
    },
    renderers: {
      type: Object as PropType<RendererOverrides | undefined>,
      default: undefined,
    },
  },
  setup(props, { attrs, slots }) {
    const focused = ref(false);
    const rootElement = ref<HTMLElement | null>(null);
    const readonlyRef = toRef(props, "readonly");
    const emptyPlaceholderRef = toRef(props, "emptyPlaceholder");
    const renderersRef = toRef(props, "renderers");
    const fieldEditor = new FieldEditorImpl(props.editor) as VueFieldEditor;
    const isDocumentEmpty = useDocumentEmptyState(props.editor);

    provideEditorContext({
      editor: props.editor,
      readonly: readonlyRef,
      emptyPlaceholder: emptyPlaceholderRef,
      renderers: renderersRef,
    });
    provideFieldEditorContext(fieldEditor);

    props.editor.internals.setSlot(FIELD_EDITOR_SLOT_KEY, fieldEditor);
    props.editor.internals.setSlot(CORE_FIELD_EDITOR_SLOT_KEY, fieldEditor);

    watch(
      rootElement,
      (nextElement, _previousElement, onCleanup) => {
        fieldEditor.setRootElement(nextElement);
        if (!nextElement) {
          focused.value = false;
          fieldEditor.setFocused(false);
          return;
        }

        const handleFocusIn = () => {
          focused.value = true;
          fieldEditor.setFocused(true);
        };

        const handleFocusOut = () => {
          const activeElement = nextElement.ownerDocument?.activeElement;
          const nextFocused =
            activeElement instanceof Node && nextElement.contains(activeElement);
          focused.value = nextFocused;
          fieldEditor.setFocused(nextFocused);
        };

        nextElement.addEventListener("focusin", handleFocusIn);
        nextElement.addEventListener("focusout", handleFocusOut);

        onCleanup(() => {
          nextElement.removeEventListener("focusin", handleFocusIn);
          nextElement.removeEventListener("focusout", handleFocusOut);
        });
      },
      { immediate: true },
    );

    watch(
      rootElement,
      (nextElement, _previousElement, onCleanup) => {
        if (!nextElement) {
          return;
        }

        const ownerDocument = nextElement.ownerDocument;
        const handleKeyDown = (event: KeyboardEvent) => {
          if (!shouldHandleEditorKeyboardEvent(nextElement, props.editor, event)) {
            return;
          }

          if (
            handleEscapeSelectionTransition({
              event,
              editor: props.editor,
              fieldEditor,
              root: nextElement,
            })
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }

          if (
            handleDeleteSelectionShortcut({
              event,
              editor: props.editor,
              fieldEditor,
            })
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }

          if (
            handleTableCellSelectionKeyDown({
              event,
              editor: props.editor,
              fieldEditor,
            })
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }

          if (
            handleSelectAllShortcut(props.editor, event, fieldEditor, {
              rootElement: nextElement,
            })
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }

          if (
            handleBlockSelectionEnter({
              event,
              editor: props.editor,
              fieldEditor,
            })
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }

          if (handleHistoryShortcut(props.editor, event)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }

          if (
            handleBlockSelectionArrow({
              event,
              editor: props.editor,
              fieldEditor,
            })
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        };

        ownerDocument?.addEventListener("keydown", handleKeyDown, true);
        onCleanup(() => {
          ownerDocument?.removeEventListener("keydown", handleKeyDown, true);
        });
      },
      { immediate: true },
    );

    watch(
      () => [props.importers, props.assets] as const,
      ([importers, assets]) => {
        props.editor.internals.setSlot("paste:importers", importers);
        props.editor.internals.setSlot(
          "paste:assetProvider",
          assets ?? importers?.assets,
        );
      },
      { immediate: true },
    );

    onBeforeUnmount(() => {
      props.editor.internals.setSlot(FIELD_EDITOR_SLOT_KEY, undefined);
      props.editor.internals.setSlot(CORE_FIELD_EDITOR_SLOT_KEY, undefined);
      props.editor.internals.setSlot("paste:importers", undefined);
      props.editor.internals.setSlot("paste:assetProvider", undefined);
      fieldEditor.setRootElement(null);
      fieldEditor.destroy();
    });

    return () => {
      const children = slots.default ? slots.default() : [h(PenContent)];

      return h(
        "div",
        mergeProps(attrs, {
          ref: (element: Element | ComponentPublicInstance | null) => {
            rootElement.value =
              element instanceof HTMLElement ? element : null;
          },
          [DATA_ATTRS.editorRoot]: "",
          [DATA_ATTRS.viewId]: props.editor.internals.viewId,
          [DATA_ATTRS.focused]: focused.value || undefined,
          [DATA_ATTRS.readonly]: props.readonly || undefined,
          [DATA_ATTRS.empty]: isDocumentEmpty.value || undefined,
          role: "textbox",
          tabIndex: -1,
          "aria-multiline": "true",
          "aria-readonly": props.readonly,
        }),
        children,
      );
    };
  },
});

export type PenEditorProps = InstanceType<typeof PenEditor>["$props"];

function shouldHandleEditorKeyboardEvent(
  root: HTMLElement,
  editor: Editor,
  event: KeyboardEvent,
): boolean {
  const targetRoot = getClosestEditorRoot(event.target);
  if (targetRoot && targetRoot !== root) {
    return false;
  }

  const activeElement = root.ownerDocument?.activeElement;
  const activeRoot = getClosestEditorRoot(activeElement);
  if (activeRoot && activeRoot !== root) {
    return false;
  }

  if (
    activeElement instanceof Node &&
    root.contains(activeElement) &&
    isTextEntryTarget(activeElement) &&
    !isFieldEditorTextEntryTarget(activeElement)
  ) {
    return false;
  }

  return (
    editor.selection?.type === "cell" ||
    editor.selection?.type === "block" ||
    editor.selection?.type === "text"
  );
}

function getClosestEditorRoot(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Node)) {
    return null;
  }

  const element =
    target instanceof HTMLElement ? target : target.parentElement;
  return element?.closest("[data-pen-editor-root]") as HTMLElement | null;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target instanceof HTMLInputElement) {
    return !(
      target.type === "checkbox" ||
      target.type === "radio" ||
      target.type === "button" ||
      target.type === "submit" ||
      target.type === "reset" ||
      target.type === "range" ||
      target.type === "color" ||
      target.type === "file"
    );
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function isFieldEditorTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.closest(`[${DATA_ATTRS.fieldEditorSurface}]`) !== null;
}

function handleEscapeSelectionTransition(options: {
  event: KeyboardEvent;
  editor: Editor;
  fieldEditor: VueFieldEditor;
  root: HTMLElement;
}): boolean {
  const { event, editor, fieldEditor, root } = options;

  if (
    event.defaultPrevented ||
    event.key !== "Escape" ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.isComposing ||
    fieldEditor.isComposing
  ) {
    return false;
  }

  const selection = editor.selection;

  if (fieldEditor.activeCellCoord && fieldEditor.isEditing) {
    const coord = fieldEditor.activeCellCoord;
    fieldEditor.deactivate();
    editor.selectCell(coord.blockId, coord.row, coord.col);
    focusBlockContainer(root, coord.blockId);
    return true;
  }

  if (selection?.type === "text" && !selection.isCollapsed) {
    fieldEditor.collapseSelectionToFocus();
    return true;
  }

  if (selection?.type === "text") {
    const blockId = selection.focus.blockId;
    fieldEditor.deactivate();
    editor.selectBlock(blockId);
    focusBlockContainer(root, blockId);
    return true;
  }

  if (selection?.type === "cell") {
    const isMultiCell =
      selection.anchor.row !== selection.head.row ||
      selection.anchor.col !== selection.head.col;

    if (isMultiCell) {
      editor.selectCell(selection.blockId, selection.anchor.row, selection.anchor.col);
      return true;
    }

    editor.selectBlock(selection.blockId);
    focusBlockContainer(root, selection.blockId);
    return true;
  }

  if (selection?.type === "block" && selection.blockIds.length > 0) {
    const focusedBlockId = selection.blockIds[0] ?? fieldEditor.focusBlockId;
    editor.setSelection(null);
    focusBlockContainer(root, focusedBlockId);
    return true;
  }

  return false;
}

function focusBlockContainer(root: HTMLElement, blockId: string | null): void {
  if (blockId) {
    const blockElement = root.querySelector(`[data-block-id="${blockId}"]`);
    if (blockElement instanceof HTMLElement) {
      blockElement.focus({ preventScroll: true });
      return;
    }
  }

  root.focus({ preventScroll: true });
}

function handleTableCellSelectionKeyDown(options: {
  event: KeyboardEvent;
  editor: Editor;
  fieldEditor: VueFieldEditor;
}): boolean {
  const { event, editor, fieldEditor } = options;
  const selection = editor.selection;

  if (selection?.type !== "cell") {
    return false;
  }
  if (event.defaultPrevented || event.isComposing || fieldEditor.isEditing) {
    return false;
  }

  const block = editor.getBlock(selection.blockId);
  if (!block) {
    return false;
  }

  const rowCount = selection.rowIds?.length ?? block.tableRowCount();
  const colCount = selection.columnIds?.length ?? block.tableColumnCount();

  if (isArrowKey(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const delta = arrowDelta(event.key);
    if (event.shiftKey) {
      const nextHead = clampCoord(
        {
          row: selection.head.row + delta.row,
          col: selection.head.col + delta.col,
        },
        rowCount,
        colCount,
      );
      setCellSelection(editor, selection, selection.anchor, nextHead);
      return true;
    }

    const exitsGrid =
      (event.key === "ArrowUp" && selection.head.row === 0) ||
      (event.key === "ArrowLeft" && selection.head.col === 0) ||
      (event.key === "ArrowDown" && selection.head.row === rowCount - 1) ||
      (event.key === "ArrowRight" && selection.head.col === colCount - 1);

    if (exitsGrid) {
      moveSelectionToAdjacentBlock(editor, fieldEditor, selection.blockId, event.key);
      return true;
    }

    setCellSelection(
      editor,
      selection,
      clampCoord(
        {
          row: selection.head.row + delta.row,
          col: selection.head.col + delta.col,
        },
        rowCount,
        colCount,
      ),
    );
    return true;
  }

  if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const direction = event.shiftKey ? -1 : 1;
    const linearIndex =
      selection.head.row * colCount + selection.head.col + direction;
    const totalCells = rowCount * colCount;
    const clamped = Math.max(0, Math.min(totalCells - 1, linearIndex));
    const nextRow = Math.floor(clamped / colCount);
    const nextCol = clamped % colCount;
    setCellSelection(editor, selection, { row: nextRow, col: nextCol });
    return true;
  }

  if (
    (event.key === "Enter" || event.key === "F2") &&
    !event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  ) {
    fieldEditor.activateCell?.(
      selection.blockId,
      selection.head.row,
      selection.head.col,
    );
    return true;
  }

  return false;
}

function handleBlockSelectionArrow(options: {
  event: KeyboardEvent;
  editor: Editor;
  fieldEditor: VueFieldEditor;
}): boolean {
  const { event, editor, fieldEditor } = options;

  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.isComposing
  ) {
    return false;
  }

  const isUp = event.key === "ArrowUp" || event.key === "ArrowLeft";
  const isDown = event.key === "ArrowDown" || event.key === "ArrowRight";
  if (!isUp && !isDown) {
    return false;
  }

  const selection = editor.selection;
  if (selection?.type !== "block" || selection.blockIds.length === 0) {
    return false;
  }

  const blockId = isUp
    ? selection.blockIds[0]!
    : selection.blockIds[selection.blockIds.length - 1]!;
  const direction = isUp ? "previous" : "next";
  const adjacentId = getAdjacentVisibleBlockId(editor, blockId, direction);
  if (!adjacentId) {
    return false;
  }

  const adjacentBlock = editor.getBlock(adjacentId);
  if (!adjacentBlock) {
    return false;
  }

  const schema = editor.schema.resolve(adjacentBlock.type);
  if (usesInlineTextSelection(schema)) {
    const offset = isUp ? adjacentBlock.length() : 0;
    fieldEditor.activateTextSelection(adjacentId, offset, offset);
    return true;
  }

  editor.selectBlock(adjacentId);
  return true;
}

function handleBlockSelectionEnter(options: {
  event: KeyboardEvent;
  editor: Editor;
  fieldEditor: VueFieldEditor;
}): boolean {
  const { event, editor, fieldEditor } = options;

  if (
    event.key !== "Enter" ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.isComposing
  ) {
    return false;
  }

  const selection = editor.selection;
  if (selection?.type !== "block" || selection.blockIds.length === 0) {
    return false;
  }

  const anchorBlockId = selection.blockIds[selection.blockIds.length - 1]!;
  const anchorBlock = editor.getBlock(anchorBlockId);
  if (!anchorBlock) {
    return false;
  }

  const schema = editor.schema.resolve(anchorBlock.type);
  if (selection.blockIds.length === 1 && usesInlineTextSelection(schema)) {
    const offset = anchorBlock.length();
    fieldEditor.activateTextSelection(anchorBlockId, offset, offset);
    return true;
  }

  const newBlockId = crypto.randomUUID();
  editor.apply(
    [
      {
        type: "insert-block",
        blockId: newBlockId,
        blockType: "paragraph",
        props: {},
        position: { after: anchorBlockId },
      },
    ],
    { origin: "user" },
  );
  fieldEditor.activateTextSelection(newBlockId, 0, 0);
  return true;
}

function handleDeleteSelectionShortcut(options: {
  event: KeyboardEvent;
  editor: Editor;
  fieldEditor: VueFieldEditor;
}): boolean {
  const { event, editor, fieldEditor } = options;

  if (
    (event.key !== "Backspace" && event.key !== "Delete") ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.isComposing ||
    fieldEditor.isComposing
  ) {
    return false;
  }

  const selection = editor.selection;
  if (!selection) {
    return false;
  }

  if (selection.type === "text" && !selection.isCollapsed) {
    if (selection.isMultiBlock) {
      fieldEditor.deactivate();
    }
    editor.deleteSelection();
    const nextSelection = editor.selection;
    if (nextSelection?.type === "text") {
      fieldEditor.activateTextSelection(
        nextSelection.focus.blockId,
        nextSelection.focus.offset,
        nextSelection.focus.offset,
      );
    } else {
      fieldEditor.deactivate();
    }
    return true;
  }

  if (selection.type === "block" && selection.blockIds.length > 0) {
    editor.deleteSelection();
    fieldEditor.deactivate();
    const firstBlock = editor.firstBlock();
    if (firstBlock) {
      const schema = editor.schema.resolve(firstBlock.type);
      if (usesInlineTextSelection(schema)) {
        fieldEditor.activateTextSelection(firstBlock.id, 0, 0);
      }
    }
    return true;
  }

  if (selection.type === "cell") {
    editor.deleteSelection();
    return true;
  }

  return false;
}

function moveSelectionToAdjacentBlock(
  editor: Editor,
  fieldEditor: VueFieldEditor,
  blockId: string,
  key: string,
): void {
  const direction =
    key === "ArrowUp" || key === "ArrowLeft" ? "previous" : "next";
  const adjacentId = getAdjacentVisibleBlockId(editor, blockId, direction);

  if (!adjacentId) {
    editor.selectBlock(blockId);
    fieldEditor.deactivate();
    return;
  }

  const adjacentBlock = editor.getBlock(adjacentId);
  if (!adjacentBlock) {
    editor.selectBlock(blockId);
    fieldEditor.deactivate();
    return;
  }

  const schema = editor.schema.resolve(adjacentBlock.type);
  if (delegatesToGridEditing(schema)) {
    const targetRow =
      direction === "previous"
        ? Math.max(adjacentBlock.tableRowCount() - 1, 0)
        : 0;
    const targetCol =
      direction === "previous"
        ? Math.max(adjacentBlock.tableColumnCount() - 1, 0)
        : 0;
    editor.selectCell(adjacentId, targetRow, targetCol);
    fieldEditor.deactivate();
    return;
  }

  if (usesInlineTextSelection(schema)) {
    const offset = direction === "previous" ? adjacentBlock.length() : 0;
    fieldEditor.activateTextSelection(adjacentId, offset, offset);
    return;
  }

  editor.selectBlock(adjacentId);
  fieldEditor.deactivate();
}

function setCellSelection(
  editor: Editor,
  selection: CellSelection,
  anchor: { row: number; col: number },
  head: { row: number; col: number } = anchor,
): void {
  if (anchor.row === head.row && anchor.col === head.col) {
    editor.selectCell(selection.blockId, anchor.row, anchor.col);
    return;
  }

  editor.selectCellRange(selection.blockId, anchor, head);
}

function clampCoord(
  coord: { row: number; col: number },
  rowCount: number,
  colCount: number,
): { row: number; col: number } {
  return {
    row: Math.max(0, Math.min(rowCount - 1, coord.row)),
    col: Math.max(0, Math.min(colCount - 1, coord.col)),
  };
}

function isArrowKey(key: string): boolean {
  return (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight"
  );
}

function arrowDelta(key: string): { row: number; col: number } {
  switch (key) {
    case "ArrowUp":
      return { row: -1, col: 0 };
    case "ArrowDown":
      return { row: 1, col: 0 };
    case "ArrowLeft":
      return { row: 0, col: -1 };
    case "ArrowRight":
      return { row: 0, col: 1 };
    default:
      return { row: 0, col: 0 };
  }
}
