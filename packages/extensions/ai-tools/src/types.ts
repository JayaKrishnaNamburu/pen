import type { ToolDefinition, ToolRuntime } from "@pen/types";

export type AIToolRuntime = ToolRuntime;

export interface AIToolDescriptor {
  name: string;
  description: string;
  inputSchema: ToolDefinition["inputSchema"];
}
