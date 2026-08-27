import { createEditor } from "@input/pen";
import { mountEditor } from "@input/pen-dom";

const editor = createEditor();

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) {
  throw new Error("Missing #app");
}

mountEditor(editor, root);
