import { fullReconcileDeltasToDOM } from "@pen/dom/field-editor/reconciler";
import { DATA_ATTRS } from "@pen/dom/utils/dataAttributes";
import {
  computed,
  defineComponent,
  h,
  ref,
  watch,
  type ComponentPublicInstance,
  type PropType,
} from "vue";
import {
  useCellTextSnapshot,
  useFieldEditorState,
} from "../internal/editorState";
import { useEditorContext } from "../internal/editorContext";
import { useFieldEditorContext } from "../internal/fieldEditorContext";

const TABLE_CELL_MIN_WIDTH = "6rem";

export const PenTableCellContent = defineComponent({
  name: "PenTableCellContent",
  props: {
    tableBlockId: {
      type: String,
      required: true,
    },
    row: {
      type: Number,
      required: true,
    },
    col: {
      type: Number,
      required: true,
    },
    placeholder: {
      type: String as PropType<string | undefined>,
      default: undefined,
    },
  },
  setup(props) {
    const { editor } = useEditorContext();
    const fieldEditor = useFieldEditorContext();
    const fieldEditorState = useFieldEditorState(fieldEditor);
    const textSnapshot = useCellTextSnapshot(
      editor,
      props.tableBlockId,
      props.row,
      props.col,
    );
    const elementRef = ref<HTMLElement | null>(null);

    const isActiveCell = computed(() => {
      const activeCell = fieldEditorState.value.activeCellCoord;
      return (
        activeCell?.blockId === props.tableBlockId &&
        activeCell.row === props.row &&
        activeCell.col === props.col
      );
    });
    const showPlaceholder = computed(() => {
      return (
        !!props.placeholder &&
        (!textSnapshot.value.text || textSnapshot.value.text === "\u200B")
      );
    });

    watch(
      [elementRef, isActiveCell],
      ([nextElement, nextIsActiveCell]) => {
        if (nextElement && nextIsActiveCell && fieldEditor) {
          fieldEditor.attachElement(nextElement);
        }
      },
      { immediate: true },
    );

    watch(
      [elementRef, textSnapshot, isActiveCell],
      ([nextElement, nextTextSnapshot, nextIsActiveCell]) => {
        if (nextIsActiveCell || !nextElement) {
          return;
        }
        if (!nextTextSnapshot.exists) {
          nextElement.replaceChildren();
          return;
        }

        fullReconcileDeltasToDOM(
          [...nextTextSnapshot.deltas],
          nextElement,
          editor.schema,
          { preserveSelection: false },
        );
      },
      { immediate: true },
    );

    return () =>
      h("span", {
        ref: (element: Element | ComponentPublicInstance | null) => {
          elementRef.value = element instanceof HTMLElement ? element : null;
        },
        [DATA_ATTRS.inlineContent]: "",
        [DATA_ATTRS.fieldEditorSurface]: "",
        [DATA_ATTRS.fieldEditorActiveSurface]: isActiveCell.value ? "" : undefined,
        [DATA_ATTRS.ignorePointerGesture]: isActiveCell.value ? "" : undefined,
        [DATA_ATTRS.placeholderVisible]: showPlaceholder.value ? "" : undefined,
        [DATA_ATTRS.tableCellRow]: props.row,
        [DATA_ATTRS.tableCellCol]: props.col,
        "data-placeholder": showPlaceholder.value ? props.placeholder : undefined,
        style: {
          minWidth: TABLE_CELL_MIN_WIDTH,
          minHeight: "1.5rem",
          display: "block",
          width: "100%",
          position: showPlaceholder.value ? "relative" : undefined,
        },
      });
  },
});

export type PenTableCellContentProps = InstanceType<
  typeof PenTableCellContent
>["$props"];
