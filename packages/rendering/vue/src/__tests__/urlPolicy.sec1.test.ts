// @vitest-environment jsdom

import { urlPolicyExtension, type UrlPolicy } from "@input/pen-dom";
import { createTestEditor } from "@input/pen-test";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { PenEditor } from "../components/PenEditor";

const DENIED_HTTPS = "https://blocked.example/page";
const DENIED_IMAGE = "https://blocked.example/img.png";
const ADMITTED_BLOB = "blob:host-admitted";

afterEach(() => {
  document.body.replaceChildren();
});

function denyUrl(denied: string): (defaults: UrlPolicy) => UrlPolicy {
  return (defaults) => ({
    resolve(raw, context) {
      if (raw === denied) {
        return null;
      }
      return defaults.resolve(raw, context);
    },
  });
}

function admitBlob(defaults: UrlPolicy): UrlPolicy {
  return {
    resolve(raw, context) {
      if (raw === ADMITTED_BLOB) {
        return ADMITTED_BLOB;
      }
      return defaults.resolve(raw, context);
    },
  };
}

describe("SEC1 Vue host urlPolicy", () => {
  it("SEC1: image fallback omits a default-admitted URL the host wrap denies", () => {
    const editor = createTestEditor({
      extensions: [urlPolicyExtension(denyUrl(DENIED_IMAGE))],
      blocks: [
        {
          id: "image-1",
          type: "image",
          props: { src: DENIED_IMAGE, alt: "denied" },
        },
      ],
    });

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor },
    });

    const image = wrapper.get("img");
    expect(image.attributes("src")).toBeUndefined();
    expect(image.attributes("data-pen-blocked-url")).toBe("");
    expect(wrapper.html()).not.toContain(DENIED_IMAGE);

    wrapper.unmount();
    editor.destroy();
  });

  it("SEC1: image fallback admits a blob: URL the host wrap allows", () => {
    const editor = createTestEditor({
      extensions: [urlPolicyExtension(admitBlob)],
      blocks: [
        {
          id: "image-1",
          type: "image",
          props: { src: ADMITTED_BLOB, alt: "admitted" },
        },
      ],
    });

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor },
    });

    const image = wrapper.get("img");
    expect(image.attributes("src")).toBe(ADMITTED_BLOB);
    expect(image.attributes("data-pen-blocked-url")).toBeUndefined();

    wrapper.unmount();
    editor.destroy();
  });

  it("SEC1: idle PenInlineContent omits a default-admitted link the host wrap denies", () => {
    const editor = createTestEditor({
      extensions: [urlPolicyExtension(denyUrl(DENIED_HTTPS))],
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "First",
        },
        {
          id: "linked",
          type: "paragraph",
          props: {},
          content: "click",
        },
      ],
    });
    editor.apply([
      {
        type: "format-text",
        blockId: "linked",
        offset: 0,
        length: 5,
        marks: { link: { href: DENIED_HTTPS } },
      },
    ]);
    editor.selectText("paragraph-1", 0, 0);

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor },
    });

    const anchor = wrapper.get('[data-block-id="linked"] a');
    expect(anchor.attributes("href")).toBeUndefined();
    expect(anchor.attributes("data-pen-blocked-url")).toBe("");
    expect(wrapper.html()).not.toContain(DENIED_HTTPS);

    wrapper.unmount();
    editor.destroy();
  });

  it("SEC1: idle PenInlineContent admits a blob: link the host wrap allows", () => {
    const editor = createTestEditor({
      extensions: [urlPolicyExtension(admitBlob)],
      blocks: [
        {
          id: "paragraph-1",
          type: "paragraph",
          props: {},
          content: "First",
        },
        {
          id: "linked",
          type: "paragraph",
          props: {},
          content: "click",
        },
      ],
    });
    editor.apply([
      {
        type: "format-text",
        blockId: "linked",
        offset: 0,
        length: 5,
        marks: { link: { href: ADMITTED_BLOB } },
      },
    ]);
    editor.selectText("paragraph-1", 0, 0);

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor },
    });

    const anchor = wrapper.get('[data-block-id="linked"] a');
    expect(anchor.attributes("href")).toBe(ADMITTED_BLOB);
    expect(anchor.attributes("data-pen-blocked-url")).toBeUndefined();

    wrapper.unmount();
    editor.destroy();
  });

  it("SEC1: idle PenTableCellContent omits a default-admitted link the host wrap denies", () => {
    const editor = createTestEditor({
      extensions: [urlPolicyExtension(denyUrl(DENIED_HTTPS))],
      blocks: [
        {
          id: "t1",
          type: "table",
          props: {},
        },
      ],
    });
    editor.apply([
      {
        type: "insert-table-cell-text",
        blockId: "t1",
        row: 0,
        col: 0,
        offset: 0,
        text: "click",
      },
      {
        type: "format-table-cell-text",
        blockId: "t1",
        row: 0,
        col: 0,
        offset: 0,
        length: 5,
        marks: { link: { href: DENIED_HTTPS } },
      },
    ]);

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor },
    });

    const anchor = wrapper.get(
      '[data-pen-table-cell][data-cell-row="0"][data-cell-col="0"] a',
    );
    expect(anchor.attributes("href")).toBeUndefined();
    expect(anchor.attributes("data-pen-blocked-url")).toBe("");
    expect(wrapper.html()).not.toContain(DENIED_HTTPS);

    wrapper.unmount();
    editor.destroy();
  });

  it("SEC1: idle PenTableCellContent admits a blob: link the host wrap allows", () => {
    const editor = createTestEditor({
      extensions: [urlPolicyExtension(admitBlob)],
      blocks: [
        {
          id: "t1",
          type: "table",
          props: {},
        },
      ],
    });
    editor.apply([
      {
        type: "insert-table-cell-text",
        blockId: "t1",
        row: 0,
        col: 0,
        offset: 0,
        text: "click",
      },
      {
        type: "format-table-cell-text",
        blockId: "t1",
        row: 0,
        col: 0,
        offset: 0,
        length: 5,
        marks: { link: { href: ADMITTED_BLOB } },
      },
    ]);

    const wrapper = mount(PenEditor, {
      attachTo: document.body,
      props: { editor },
    });

    const anchor = wrapper.get(
      '[data-pen-table-cell][data-cell-row="0"][data-cell-col="0"] a',
    );
    expect(anchor.attributes("href")).toBe(ADMITTED_BLOB);
    expect(anchor.attributes("data-pen-blocked-url")).toBeUndefined();

    wrapper.unmount();
    editor.destroy();
  });
});
