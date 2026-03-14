import type { Editor, Extension } from "@pen/types";
import { defineExtension } from "@pen/types";
import { ToolRuntimeImpl } from "./toolServer";
import { readDocumentTool } from "./tools/readDocument";
import { writeDocumentTool } from "./tools/writeDocument";
import { getContextTool } from "./tools/getContext";
import { getCursorContextTool } from "./tools/getCursorContext";
import { inspectTargetTool } from "./tools/inspectTarget";
import { listValidOperationsTool } from "./tools/listValidOperations";
import { searchDocumentTool } from "./tools/searchDocument";
import { retrieveDocumentSpansTool } from "./tools/retrieveDocumentSpans";
import { listBlockTypesTool } from "./tools/listBlockTypes";
import { insertBlockTool } from "./tools/insertBlock";
import { updateBlockTool } from "./tools/updateBlock";
import { deleteBlockTool } from "./tools/deleteBlock";
import { moveBlockTool } from "./tools/moveBlock";
import { DOCUMENT_OPS_TOOL_RUNTIME_SLOT } from "./constants/toolServer";

export interface DocumentOpsOptions {
  enableGenerationZones?: boolean;
}

export function documentOpsExtension(
  _options?: DocumentOpsOptions,
): Extension {
  let toolRuntime: ToolRuntimeImpl | null = null;
  let activeEditor: Editor | null = null;

  return defineExtension({
    name: "document-ops",

    activateClient: async (ctx) => {
      activeEditor = ctx.editor;
      toolRuntime = new ToolRuntimeImpl();

      toolRuntime.registerTool(readDocumentTool(ctx.editor));
      toolRuntime.registerTool(writeDocumentTool(ctx.editor));
      toolRuntime.registerTool(getContextTool(ctx.editor));
      toolRuntime.registerTool(getCursorContextTool(ctx.editor));
      toolRuntime.registerTool(inspectTargetTool(ctx.editor));
      toolRuntime.registerTool(listValidOperationsTool(ctx.editor));
      toolRuntime.registerTool(searchDocumentTool(ctx.editor));
      toolRuntime.registerTool(retrieveDocumentSpansTool(ctx.editor));
      toolRuntime.registerTool(listBlockTypesTool(ctx.editor));
      toolRuntime.registerTool(insertBlockTool(ctx.editor));
      toolRuntime.registerTool(updateBlockTool(ctx.editor));
      toolRuntime.registerTool(deleteBlockTool(ctx.editor));
      toolRuntime.registerTool(moveBlockTool(ctx.editor));

      ctx.editor.internals.setSlot(
        DOCUMENT_OPS_TOOL_RUNTIME_SLOT,
        toolRuntime,
      );
    },

    deactivateClient: async () => {
      activeEditor?.internals.setSlot(
        DOCUMENT_OPS_TOOL_RUNTIME_SLOT,
        undefined,
      );
      activeEditor = null;
      toolRuntime = null;
    },
  });
}
