import type { Editor } from "@pen/types";
import {
  DOCUMENT_OPS_TOOL_RUNTIME_SLOT,
  getDocumentToolRuntime,
  ToolContextImpl,
  ToolRuntimeImpl,
} from "@pen/document-ops";
import type { AIToolRuntime } from "./types";

export const AI_TOOL_RUNTIME_SLOT = DOCUMENT_OPS_TOOL_RUNTIME_SLOT;

export function getAIToolRuntime(editor: Editor): AIToolRuntime | null {
  return getDocumentToolRuntime(editor);
}

export { ToolContextImpl as AIToolContextImpl, ToolRuntimeImpl as AIToolRuntimeImpl };
