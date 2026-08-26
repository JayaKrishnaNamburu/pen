import { defineComponent, h } from "vue";
import { PenInlineContent } from "./PenInlineContent";

/**
 * Renders a single editable text field for one block, for hosts building
 * their own block chrome. A thin alias over `PenInlineContent` that
 * defaults its wrapper to `span`.
 */
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
