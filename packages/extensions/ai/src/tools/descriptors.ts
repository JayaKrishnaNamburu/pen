import type { ToolDefinition } from "@input/pen-types";
import { isDestructiveAITool, isMutatingAITool, type AIToolGrant } from "./authority";
import { AI_EDIT_CHANNEL_DISCOVERY_TOOL_NAMES } from "./constants";
import type { AIToolDescriptor, AIToolRuntime } from "./types";

function toAIToolDescriptor(definition: ToolDefinition): AIToolDescriptor {
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

const EDIT_CHANNEL_DISCOVERY_TOOL_NAME_SET: ReadonlySet<string> = new Set(
  AI_EDIT_CHANNEL_DISCOVERY_TOOL_NAMES,
);

/**
 * Route-scoped advertise filter (EC16). Does not change the grant: a tool
 * that cannot execute is never added, and a granted mutator is never hidden.
 */
export function advertiseAIToolsForRoute(
  tools: readonly AIToolDescriptor[],
  route: { editChannel: boolean; hasBlockAnnotations: boolean },
): readonly AIToolDescriptor[] {
  if (!route.editChannel) {
    return tools;
  }
  return tools.filter((tool) => {
    if (tool.mutating) {
      return true;
    }
    if (route.hasBlockAnnotations) {
      return false;
    }
    return EDIT_CHANNEL_DISCOVERY_TOOL_NAME_SET.has(tool.name);
  });
}
