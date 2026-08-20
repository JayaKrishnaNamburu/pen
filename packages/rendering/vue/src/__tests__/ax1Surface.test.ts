// @vitest-environment jsdom

import { createTestEditor } from "@input/pen-test";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { PenEditor } from "../components/PenEditor";

afterEach(() => {
  document.body.replaceChildren();
});

describe("@input/pen-vue AX1 surface", () => {
  it("AX1: content root is a multiline textbox", () => {
    const editor = createTestEditor({
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "Hello",
        },
      ],
    });

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor },
    });

    const root = wrapper.get("[data-pen-editor-root]");
    expect(root.attributes("role")).toBe("textbox");
    expect(root.attributes("aria-multiline")).toBe("true");
    expect(root.attributes("aria-label")).toBe("Editor");

    wrapper.unmount();
    editor.destroy();
  });

  it("AX1: content root uses createEditor a11yLabel", () => {
    const editor = createTestEditor({
      a11yLabel: "Compose email",
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "Hello",
        },
      ],
    });

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor },
    });

    const root = wrapper.get("[data-pen-editor-root]");
    expect(root.attributes("aria-label")).toBe("Compose email");
    expect(root.attributes("aria-labelledby")).toBeUndefined();

    wrapper.unmount();
    editor.destroy();
  });

  it("AX1: readonly prop is reflected as aria-readonly", () => {
    const editor = createTestEditor({
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "Hello",
        },
      ],
    });

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor, readonly: true },
    });

    expect(wrapper.get("[data-pen-editor-root]").attributes("aria-readonly")).toBe(
      "true",
    );

    wrapper.unmount();
    editor.destroy();
  });
});
