import { fullReconcileDeltasToDOM } from "@input/pen-dom/field-editor/reconciler";
import { pointToEditorSelectionPoint } from "@input/pen-dom/field-editor/selectionBridge";
import { DATA_ATTRS } from "@input/pen-dom/utils/dataAttributes";
import { applyInlineDecorationsToDeltas } from "@input/pen-dom/utils/inlineDecorations";
import { replaceElementChildren } from "@input/pen-dom/utils/replaceElementChildren";
import type { InlineDecoration } from "@input/pen-types";
import {
  computed,
  defineComponent,
  h,
  ref,
  watch,
  type ComponentPublicInstance,
  type PropType,
} from "vue";
import { useSelection } from "../composables/useSelection";
import {
  isBlockSelected,
  useBlockDecorations,
  useBlockModel,
  useBlockTextSnapshot,
  useDocumentPlaceholderState,
  useFieldEditorState,
} from "../internal/editorState";
import { resolveEditorSchemaPlaceholder } from "../internal/displayCopy";
import { useEditorContext } from "../internal/editorContext";
import { useFieldEditorContext } from "../internal/fieldEditorContext";

export const PenInlineContent = defineComponent({
  name: "PenInlineContent",
  props: {
    blockId: {
      type: String,
      required: true,
    },
    placeholder: {
      type: String as PropType<string | undefined>,
      default: undefined,
    },
    as: {
      type: String as PropType<string>,
      default: "span",
    },
    direction: {
      type: String as PropType<string | undefined>,
      default: undefined,
    },
  },
  setup(props) {
    const { editor, readonly, emptyPlaceholder } = useEditorContext();
    const fieldEditor = useFieldEditorContext();
    const selection = useSelection(editor);
    const fieldEditorState = useFieldEditorState(fieldEditor);
    const blockModel = useBlockModel(editor, props.blockId);
    const blockDecorations = useBlockDecorations(editor, props.blockId);
    const textSnapshot = useBlockTextSnapshot(editor, props.blockId);
    const documentPlaceholderVisible = useDocumentPlaceholderState(editor);
    const elementRef = ref<HTMLElement | null>(null);

    const isActive = computed(
      () => fieldEditorState.value.focusBlockId === props.blockId,
    );
    const isExpandedOwnedBlock = computed(
      () =>
        fieldEditorState.value.mode === "expanded" &&
        fieldEditorState.value.activeBlockIds.includes(props.blockId),
    );
    const schemaPlaceholder = computed(() =>
      resolveEditorSchemaPlaceholder(editor, props.blockId),
    );
    const isFirstBlock = computed(
      () => editor.documentState.blockOrder[0] === props.blockId,
    );
    const isFocusedBlock = computed(() => {
      return (
        isActive.value ||
        (selection.value?.type === "text" &&
          selection.value.isCollapsed &&
          selection.value.focus.blockId === props.blockId)
      );
    });
    const blockTextEmpty = computed(
      () => !textSnapshot.value.text || textSnapshot.value.text === "\u200B",
    );
    const placeholder = computed(() => {
      if (
        blockTextEmpty.value &&
        isFirstBlock.value &&
        documentPlaceholderVisible.value &&
        emptyPlaceholder.value
      ) {
        return emptyPlaceholder.value;
      }

      if (
        blockTextEmpty.value &&
        isFocusedBlock.value &&
        props.placeholder &&
        !documentPlaceholderVisible.value
      ) {
        return props.placeholder;
      }

      if (
        blockTextEmpty.value &&
        isFocusedBlock.value &&
        !props.placeholder &&
        schemaPlaceholder.value &&
        !documentPlaceholderVisible.value
      ) {
        return schemaPlaceholder.value;
      }

      return undefined;
    });
    const renderedDeltas = computed(() => {
      const inlineDecorations = blockDecorations.value.filter(
        (decoration): decoration is InlineDecoration =>
          decoration.type === "inline",
      );

      return inlineDecorations.length > 0
        ? applyInlineDecorationsToDeltas(
            textSnapshot.value.deltas,
            inlineDecorations,
          )
        : [...textSnapshot.value.deltas];
    });

    watch(
      [elementRef, isActive, fieldEditorState],
      ([nextElement, nextIsActive, nextFieldEditorState]) => {
        if (
          nextElement &&
          nextIsActive &&
          fieldEditor &&
          nextFieldEditorState.mode !== "expanded"
        ) {
          fieldEditor.attachElement(nextElement);
        }
      },
      { immediate: true },
    );

    watch(
      [elementRef, textSnapshot, renderedDeltas, isActive, isExpandedOwnedBlock],
      ([nextElement, nextTextSnapshot, nextRenderedDeltas, nextIsActive, nextIsExpandedOwnedBlock]) => {
        if (!nextElement) {
          return;
        }
        if (nextIsActive || nextIsExpandedOwnedBlock) {
          return;
        }
        if (!nextTextSnapshot.exists) {
          // HOST4: replaceChildren is above some hosts; fallback clears then
          // appends. The inactive block still empties — no user-visible
          // degradation.
          replaceElementChildren(nextElement);
          return;
        }

        fullReconcileDeltasToDOM(
          [...nextRenderedDeltas],
          nextElement,
          editor.schema,
          { preserveSelection: false },
        );
      },
      { immediate: true },
    );

    const activateBlockAtEnd = () => {
      if (readonly.value || !fieldEditor) {
        return;
      }

      const block = editor.getBlock(props.blockId);
      if (!block) {
        return;
      }

      const caretOffset = block.length();
      fieldEditor.activateTextSelection(props.blockId, caretOffset, caretOffset);
    };

    const activateBlockFromPointer = (event: MouseEvent) => {
      if (readonly.value || !fieldEditor) {
        return;
      }

      const inlineElement = elementRef.value;
      const rootElement = inlineElement?.closest(
        `[${DATA_ATTRS.editorRoot}]`,
      ) as HTMLElement | null;
      const point =
        rootElement != null
          ? pointToEditorSelectionPoint(rootElement, event.clientX, event.clientY)
          : null;

      if (point && point.blockId === props.blockId) {
        fieldEditor.activateTextSelection(point.blockId, point.offset, point.offset);
        return;
      }

      activateBlockAtEnd();
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (readonly.value || isActive.value) {
        return;
      }
      event.preventDefault();
      activateBlockFromPointer(event);
    };

    const handleClick = (event: MouseEvent) => {
      if (!readonly.value && !isActive.value) {
        activateBlockFromPointer(event);
      }
    };

    // DIR2: the block host (PenBlock) is the resolved-dir sink. This
    // surface only applies an explicit override — the direction prop or
    // the block's declared props.direction — so standalone mounts keep
    // working and the inline span inherits the block's resolved dir when
    // neither is set. Never `dir="auto"`. AX4: do not set `aria-hidden`
    // (visible atom chips stay in the tree; `aria-label` comes from the
    // reconciler).
    return () =>
      h(
        props.as,
        {
          ref: (element: Element | ComponentPublicInstance | null) => {
            elementRef.value =
              element instanceof HTMLElement ? element : null;
          },
          [DATA_ATTRS.inlineContent]: "",
          [DATA_ATTRS.fieldEditorSurface]: "",
          [DATA_ATTRS.fieldEditorActiveSurface]:
            isActive.value && fieldEditorState.value.mode !== "expanded"
              ? ""
              : undefined,
          [DATA_ATTRS.placeholderVisible]: placeholder.value ? "" : undefined,
          "data-placeholder": placeholder.value,
          dir: resolveInlineContentDir(
            props.direction ?? blockModel.value.props?.direction,
          ),
          style: placeholder.value ? { position: "relative" } : undefined,
          onMousedown: handleMouseDown,
          onClick: handleClick,
          "data-selected":
            isBlockSelected(selection.value, props.blockId) || undefined,
        },
        [],
      );
  },
});

function resolveInlineContentDir(
  direction: unknown,
): "ltr" | "rtl" | undefined {
  if (direction === "ltr" || direction === "rtl") {
    return direction;
  }
  return undefined;
}

export type PenInlineContentProps = InstanceType<typeof PenInlineContent>["$props"];
