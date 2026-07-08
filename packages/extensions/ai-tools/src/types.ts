import type { ToolDefinition, ToolRuntime } from "@input/pen-types";

export type AIToolRuntime = ToolRuntime;

export interface AIToolDescriptor {
  name: string;
  description: string;
  inputSchema: ToolDefinition["inputSchema"];
}
