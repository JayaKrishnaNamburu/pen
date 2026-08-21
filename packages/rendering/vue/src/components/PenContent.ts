import {
  buildDataAttributes,
  DATA_ATTRS,
} from "@input/pen-dom/utils/dataAttributes";
import { fieldEditorTextEntryAttrs } from "@input/pen-dom/utils/fieldEditorTextEntryAttrs";
import {
  defineComponent,
  h,
  onMounted,
  onUpdated,
  ref,
  watch,
  type ComponentPublicInstance,
  type PropType,
} from "vue";
import { useBlockList } from "../composables/useBlockList";
import { useEditorContext } from "../internal/editorContext";
import {
  useDocumentEmptyState,
  useFieldEditorState,
} from "../internal/editorState";
import { useFieldEditorContext } from "../internal/fieldEditorContext";
import { PenBlock } from "./PenBlock";

export const PenContent = defineComponent({
  name: "PenContent",
  props: {
    as: {
      type: String as PropType<string>,
      default: "div",
    },
  },
  setup(props) {
    const { editor } = useEditorContext();
    const fieldEditor = useFieldEditorContext();
    const fieldEditorState = useFieldEditorState(fieldEditor);
    const blockIds = useBlockList(editor);
    const isEmpty = useDocumentEmptyState(editor);
    const blocksHostElement = ref<HTMLElement | null>(null);

    watch(
      [blocksHostElement, fieldEditorState],
      ([nextElement, nextFieldEditorState]) => {
        if (
          nextElement &&
          fieldEditor &&
          nextFieldEditorState.mode === "expanded"
        ) {
          fieldEditor.attachElement(nextElement);
        }
      },
      { immediate: true },
    );

    const ackMountedBlocks = () => {
      const host = blocksHostElement.value;
      if (!host || !fieldEditor) {
        return;
      }
      for (const element of host.querySelectorAll(
        `[${DATA_ATTRS.editorBlock}]`,
      )) {
        if (!(element instanceof HTMLElement)) {
          continue;
        }
        const blockId = element.getAttribute(DATA_ATTRS.blockId);
        if (blockId) {
          fieldEditor.ackBlockMounted(blockId, element);
        }
      }
    };
    onMounted(ackMountedBlocks);
    onUpdated(ackMountedBlocks);

    return () => {
      const blockNodes = blockIds.value.map((blockId) =>
        h(PenBlock, {
          key: blockId,
          blockId,
        }),
      );

      return h(
        props.as,
        {
          [DATA_ATTRS.editorContent]: "",
          ...buildDataAttributes({
            empty: isEmpty.value,
          }),
        },
        [
          h(
            "div",
            {
              ref: (element: Element | ComponentPublicInstance | null) => {
                blocksHostElement.value =
                  element instanceof HTMLElement ? element : null;
              },
              "data-pen-editor-blocks-host": "",
              ...(fieldEditorState.value.mode === "expanded"
                ? {
                    [DATA_ATTRS.fieldEditorSurface]: "",
                    ...fieldEditorTextEntryAttrs(true, editor),
                  }
                : {}),
            },
            blockNodes,
          ),
        ],
      );
    };
  },
});
