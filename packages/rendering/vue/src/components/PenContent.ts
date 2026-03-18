import { DATA_ATTRS } from "@pen/dom/utils/dataAttributes";
import {
  defineComponent,
  h,
  ref,
  watch,
  type ComponentPublicInstance,
  type PropType,
} from "vue";
import { useBlockList } from "../composables/useBlockList";
import { useEditorContext } from "../internal/editorContext";
import { useFieldEditorState } from "../internal/editorState";
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

    return () => {
      const blockNodes = blockIds.value.map((blockId) =>
        h(PenBlock, {
          key: blockId,
          blockId,
        }),
      );

      return h(props.as, { [DATA_ATTRS.editorContent]: "" }, [
        h(
          "div",
          {
            ref: (element: Element | ComponentPublicInstance | null) => {
              blocksHostElement.value =
                element instanceof HTMLElement ? element : null;
            },
            "data-pen-editor-blocks-host": "",
            [DATA_ATTRS.fieldEditorSurface]:
              fieldEditorState.value.mode === "expanded" ? "" : undefined,
            [DATA_ATTRS.fieldEditorActiveSurface]:
              fieldEditorState.value.mode === "expanded" ? "" : undefined,
          },
          blockNodes,
        ),
      ]);
    };
  },
});
