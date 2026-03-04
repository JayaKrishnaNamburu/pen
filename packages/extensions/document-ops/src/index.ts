import type { Extension, ToolContext } from "@pen/core";

export interface DocumentOpsOptions {
  enableGenerationZones?: boolean;
}

export function documentOps(_options?: DocumentOpsOptions): Extension {
  throw new Error("Not implemented");
}

export type { ToolContext };
