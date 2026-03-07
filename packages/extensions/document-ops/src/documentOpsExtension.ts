import type { Extension } from "@pen/types";
import { defineExtension } from "@pen/types";
import { ToolServerImpl } from "./toolServer.js";
import { readDocumentTool } from "./tools/readDocument.js";
import { writeDocumentTool } from "./tools/writeDocument.js";
import { getContextTool } from "./tools/getContext.js";
import { searchDocumentTool } from "./tools/searchDocument.js";
import { listBlockTypesTool } from "./tools/listBlockTypes.js";
import { insertBlockTool } from "./tools/insertBlock.js";
import { updateBlockTool } from "./tools/updateBlock.js";
import { deleteBlockTool } from "./tools/deleteBlock.js";
import { moveBlockTool } from "./tools/moveBlock.js";

export interface DocumentOpsOptions {
  enableGenerationZones?: boolean;
}

export function documentOpsExtension(
  _options?: DocumentOpsOptions,
): Extension {
  let toolServer: ToolServerImpl | null = null;

  return defineExtension({
    name: "document-ops",

    activateClient: async (ctx) => {
      toolServer = new ToolServerImpl();

      toolServer.registerTool(readDocumentTool(ctx.editor));
      toolServer.registerTool(writeDocumentTool(ctx.editor));
      toolServer.registerTool(getContextTool(ctx.editor));
      toolServer.registerTool(searchDocumentTool(ctx.editor));
      toolServer.registerTool(listBlockTypesTool(ctx.editor));
      toolServer.registerTool(insertBlockTool(ctx.editor));
      toolServer.registerTool(updateBlockTool(ctx.editor));
      toolServer.registerTool(deleteBlockTool(ctx.editor));
      toolServer.registerTool(moveBlockTool(ctx.editor));

      ctx.editor.internals.setSlot(
        "document-ops:toolServer",
        toolServer,
      );
    },

    deactivateClient: async () => {
      toolServer = null;
    },
  });
}
