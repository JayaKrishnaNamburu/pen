import {
  collectToolExecutionOutput,
  type ToolContext,
} from "@input/pen-types";
import type { AIToolRuntime } from "./types";

export async function executeAITool(
  toolRuntime: AIToolRuntime,
  name: string,
  input: unknown,
  context: ToolContext,
): Promise<unknown> {
  return collectToolExecutionOutput(
    toolRuntime.executeTool(name, input, context),
  );
}
