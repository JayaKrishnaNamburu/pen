import { defineComponent, h } from "vue";
import { PenInlineContent } from "./PenInlineContent";

export const PenFieldEditor = defineComponent({
  name: "PenFieldEditor",
  props: {
    blockId: {
      type: String,
      required: true,
    },
    placeholder: {
      type: String,
      default: undefined,
    },
    as: {
      type: String,
      default: "span",
    },
  },
  setup(props) {
    return () => h(PenInlineContent, props);
  },
});
