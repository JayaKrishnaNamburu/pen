import type { ToolDefinition } from "@pen/types";
import type { AIToolDescriptor, AIToolRuntime } from "./types";

export function toAIToolDescriptor(definition: ToolDefinition): AIToolDescriptor {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
  };
}

export function listAITools(toolRuntime: AIToolRuntime): readonly AIToolDescriptor[] {
  return toolRuntime.listTools().map(toAIToolDescriptor);
}
