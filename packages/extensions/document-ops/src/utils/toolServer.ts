import { documentOpsToolRuntimeFacet } from "@input/pen-core";
import type { Editor, ToolRuntime } from "@input/pen-types";

export function getDocumentToolRuntime(editor: Editor): ToolRuntime | null {
  return (
    (editor.facet(documentOpsToolRuntimeFacet) as ToolRuntime | null) ?? null
  );
}
