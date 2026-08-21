// @vitest-environment jsdom

import {
  getSelectionBlockRange,
  getTrustedSelectionBlockRange,
} from "@input/pen-core";
import { createTestEditor } from "@input/pen-test";
import type { Editor } from "@input/pen-types";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, type PropType } from "vue";
import { PenEditor } from "../components/PenEditor";

afterEach(() => {
  document.body.replaceChildren();
});

const editorProp = {
  type: Object as PropType<Editor>,
  required: true,
};

function createWalkComponent(
  walk: (editor: Editor) => void,
  name: string,
) {
  return defineComponent({
    name,
    props: {
      editor: editorProp,
    },
    setup(props) {
      return () => {
        const currentEditor = props.editor;
        if (!currentEditor) {
          return h("div");
        }
        walk(currentEditor);
        return h("div", { "data-walk": name });
      };
    },
  });
}

describe("@input/pen-vue selection helpers", () => {
  it("walking the live blockOrder through a Vue-proxied editor during render exceeds the update cap", async () => {
    const editor = createTestEditor({
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
    editor.selectTextRange(
      { blockId: "paragraph-1", offset: 0 },
      { blockId: "paragraph-2", offset: 6 },
    );

    const LiveWalk = createWalkComponent((currentEditor) => {
      getSelectionBlockRange(
        currentEditor.internals.doc,
        currentEditor.selection,
      );
    }, "LiveWalk");

    mount(LiveWalk, {
      attachTo: document.body,
      props: { editor },
    });

    await expect(nextTick()).rejects.toThrow(
      /Maximum recursive updates exceeded/,
    );

    editor.destroy();
  });

  it("reading the stamped range through a Vue-proxied editor during render does not recurse", async () => {
    const editor = createTestEditor({
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
    editor.selectTextRange(
      { blockId: "paragraph-1", offset: 0 },
      { blockId: "paragraph-2", offset: 6 },
    );

    const TrustedWalk = createWalkComponent((currentEditor) => {
      getTrustedSelectionBlockRange(currentEditor.selection);
    }, "TrustedWalk");

    const wrapper = mount(TrustedWalk, {
      attachTo: document.body,
      props: { editor },
    });

    await expect(nextTick()).resolves.toBeUndefined();
    expect(wrapper.get("[data-walk]").attributes("data-walk")).toBe(
      "TrustedWalk",
    );

    wrapper.unmount();
    editor.destroy();
  });

  it("PenBlock marks a multi-block text span from the stamped range", async () => {
    const editor = createTestEditor({
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

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor },
    });

    editor.selectTextRange(
      { blockId: "paragraph-1", offset: 0 },
      { blockId: "paragraph-2", offset: 6 },
    );
    await nextTick();

    expect(
      wrapper.get('[data-block-id="paragraph-1"]').attributes("data-selected"),
    ).toBe("");
    expect(
      wrapper.get('[data-block-id="paragraph-2"]').attributes("data-selected"),
    ).toBe("");

    wrapper.unmount();
    editor.destroy();
  });

  it("a collapsed text caret shows the empty heading placeholder without a pointer activate", async () => {
    const editor = createTestEditor({
      messages: {
        "pen.schema.heading.placeholder": "Title please",
      },
      blocks: [
        {
          id: "heading-1",
          type: "heading",
          props: { level: 1 },
          content: "",
        },
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "Body",
        },
      ],
    });

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor },
    });

    editor.selectText("heading-1", 0, 0);
    await nextTick();

    expect(
      wrapper
        .get('[data-block-id="heading-1"] [data-pen-inline-content]')
        .attributes("data-placeholder"),
    ).toBe("Title please");

    wrapper.unmount();
    editor.destroy();
  });
});
