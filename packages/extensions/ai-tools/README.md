# `@input/pen-ai-tools`

`@input/pen-ai-tools` is the canonical public tool surface for Pen agents and direct editor-attached AI flows.

Start here when you need to:

- resolve the active tool runtime from a Pen editor
- list tool descriptors for an agent runtime
- execute tools against the editor's shared `ToolRuntime`
- buffer progressive tool output into stable JSON-friendly results
- grant mutating tools for a session and enforce AIB3 call/op budgets

## Usage

```ts
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import {
  getAIToolRuntime,
  listAITools,
  executeAITool,
  AIToolContextImpl,
} from "@input/pen-ai-tools";

const editor = createEditor({
  preset: defaultPreset(),
});
const toolRuntime = getAIToolRuntime(editor);

if (!toolRuntime) {
  throw new Error("AI tools are unavailable.");
}

const tools = listAITools(toolRuntime);
const context = new AIToolContextImpl(editor, "doc-1", () => {});
const result = await executeAITool(toolRuntime, "read_document", {}, context);
```

Model-driven writes go through a session turn. Mutating tools are default-deny until the host allowlists them; exhausting a budget ends the turn with a reason and does not throw.

```ts
import {
  createAIToolTurn,
  executeAITool,
  isAIToolCallDenied,
  AI_TOOL_MAX_CALLS_PER_TURN,
  AI_TOOL_MAX_OPS_PER_CALL,
  AI_TOOL_MAX_TOTAL_OPS_PER_TURN,
} from "@input/pen-ai-tools";

const turn = createAIToolTurn({
  allowedMutatingTools: ["insert_block", "update_block"],
  confirm: ({ toolName }) =>
    toolName === "delete_block" ? "refuse" : "allow",
});

const output = await executeAITool(
  toolRuntime,
  "insert_block",
  input,
  context,
  turn,
);

if (isAIToolCallDenied(output) || turn.ended) {
  // turn.reason is "budget-calls-exhausted" | "budget-ops-per-call-exhausted" |
  // "budget-total-ops-exhausted" | a grant refusal. Stop the turn.
}
```

Defaults: `AI_TOOL_MAX_CALLS_PER_TURN` 20, `AI_TOOL_MAX_OPS_PER_CALL` 32, `AI_TOOL_MAX_TOTAL_OPS_PER_TURN` 128. The agentic loop's `maxSteps` default is 10 (`AI_AGENTIC_MAX_STEPS_DEFAULT`); the first of steps, calls, or ops that hits its cap ends the turn.

`executeAITool` without a turn keeps the legacy execute path (playground and host callers that have not adopted grants yet). `@input/pen-ai-tools` builds on the same document semantics as `@input/pen-document-ops`; it does not fork or replace them.
