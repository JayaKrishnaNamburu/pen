import type { Editor } from "@input/pen-types";
import {
  getDocumentToolRuntime,
  ToolContextImpl,
  ToolRuntimeImpl,
} from "@input/pen-document-ops";
import type { AIToolRuntime } from "./types";

export function getAIToolRuntime(editor: Editor): AIToolRuntime | null {
  return getDocumentToolRuntime(editor);
}

export { ToolContextImpl as AIToolContextImpl, ToolRuntimeImpl as AIToolRuntimeImpl };
