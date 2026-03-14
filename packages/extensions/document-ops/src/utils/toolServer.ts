import type { Editor, ToolRuntime } from "@pen/types";
import { DOCUMENT_OPS_TOOL_RUNTIME_SLOT } from "../constants/toolServer";

export function getDocumentToolRuntime(editor: Editor): ToolRuntime | null {
  return editor.internals.getSlot<ToolRuntime>(DOCUMENT_OPS_TOOL_RUNTIME_SLOT) ?? null;
}
