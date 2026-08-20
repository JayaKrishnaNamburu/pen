import type { ToolDefinition } from "@input/pen-types";
import { isDestructiveAITool, isMutatingAITool, type AIToolGrant } from "./authority";
import type { AIToolDescriptor, AIToolRuntime } from "./types";

export function toAIToolDescriptor(definition: ToolDefinition): AIToolDescriptor {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    mutating: isMutatingAITool(definition.name, definition),
    destructive: isDestructiveAITool(definition.name, definition),
  };
}

export function listAITools(
  toolRuntime: AIToolRuntime,
  grant?: Pick<AIToolGrant, "allowedMutatingTools">,
): readonly AIToolDescriptor[] {
  const descriptors = toolRuntime.listTools().map(toAIToolDescriptor);
  if (!grant) {
    return descriptors;
  }
  const allowed = new Set(grant.allowedMutatingTools);
  return descriptors.filter((tool) => !tool.mutating || allowed.has(tool.name));
}
