// @vitest-environment jsdom

import { createDecorationSet } from "@pen/core";
import { createTestEditor } from "@pen/test";
import type { Editor } from "@pen/types";
import { defineExtension } from "@pen/types";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import {
  defineComponent,
  h,
  nextTick,
  resolveComponent,
  type Component,
  type PropType,
} from "vue";
import {
  PenVuePlugin,
  useBlockList,
  useDecorations,
  useEditor,
  useSelection,
} from "../index";

afterEach(() => {
  document.body.innerHTML = "";
});

const editorProp = {
  type: Object as PropType<Editor>,
  required: true,
};

describe("@pen/vue public API", () => {
  it("registers PenEditor through the plugin", () => {
    const editor = createTestEditor({
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "Plugin ready",
        },
      ],
    });

    const PluginHarness = defineComponent({
      props: {
        editor: editorProp,
      },
      setup(props) {
        const PenEditorComponent = resolveComponent("PenEditor") as Component;
        return () => h(PenEditorComponent, { editor: props.editor });
      },
    });

    const wrapper = mount(PluginHarness, {
      attachTo: document.body,
      props: { editor },
      global: {
        plugins: [PenVuePlugin],
      },
    });

    expect(wrapper.text()).toContain("Plugin ready");
    expect(wrapper.find("[data-pen-editor-root]").exists()).toBe(true);

    wrapper.unmount();
    editor.destroy();
  });

  it("updates selection, block list, and decoration composables", async () => {
    let decorationsEnabled = false;
    const decorationsExtension = defineExtension({
      name: "test-vue-decorations",
      decorations(_state, currentEditor) {
        const blockId = currentEditor.firstBlock()?.id;
        if (!decorationsEnabled || !blockId) {
          return createDecorationSet([]);
        }

        return createDecorationSet([
          {
            type: "block",
            blockId,
            attributes: { highlighted: true },
          },
        ]);
      },
    });

    const editor = createTestEditor({
      extensions: [decorationsExtension],
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "First",
        },
        {
          id: "paragraph-2",
          type: "paragraph",
          props: {},
          content: "Second",
        },
      ],
    });

    const ComposableHarness = defineComponent({
      props: {
        editor: editorProp,
      },
      setup(props) {
        const editor = useEditor(props.editor);
        const selection = useSelection(editor);
        const blockIds = useBlockList(editor);
        const decorations = useDecorations(editor);

        return () =>
          h(
            "div",
            {
              "data-selection-type": selection.value?.type ?? "none",
              "data-block-count": String(blockIds.value.length),
              "data-decoration-count": String(decorations.value.decorations.length),
            },
            blockIds.value.join(","),
          );
      },
    });

    const wrapper = mount(ComposableHarness, {
      attachTo: document.body,
      props: { editor },
    });

    expect(wrapper.attributes("data-selection-type")).toBe("none");
    expect(wrapper.attributes("data-block-count")).toBe("2");
    expect(wrapper.attributes("data-decoration-count")).toBe("0");

    editor.selectBlock("paragraph-1");
    await nextTick();
    expect(wrapper.attributes("data-selection-type")).toBe("block");

    editor.apply(
      [
        {
          type: "insert-block",
          blockId: "paragraph-3",
          blockType: "paragraph",
          props: {},
          position: "last",
        },
        {
          type: "insert-text",
          blockId: "paragraph-3",
          offset: 0,
          text: "Third",
        },
      ],
      { origin: "user" },
    );
    await nextTick();

    expect(wrapper.attributes("data-block-count")).toBe("3");
    expect(wrapper.text()).toContain("paragraph-3");

    decorationsEnabled = true;
    editor.requestDecorationUpdate();
    await nextTick();

    expect(wrapper.attributes("data-decoration-count")).toBe("1");

    wrapper.unmount();
    editor.destroy();
  });
});
