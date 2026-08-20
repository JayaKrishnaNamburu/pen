import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useEditorContext } from "../context/editorContext";

function ContextConsumer() {
  useEditorContext();
  return React.createElement("div", null, "ok");
}

describe("@input/pen-react editor context", () => {
  it("CH5: throws with an actionable error outside Pen.Editor.Root without console.*", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderToStaticMarkup(React.createElement(ContextConsumer))).toThrow(
      "Missing Pen.Editor.Root context. Wrap your editor components in <Pen.Editor.Root editor={editor}>.",
    );
    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
