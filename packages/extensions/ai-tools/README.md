# `@input/pen-ai-tools`

`@input/pen-ai-tools` is the canonical public tool surface for Pen agents and direct editor-attached AI flows.

It does not replace `@input/pen-document-ops`. Mutating tools are default-deny until the host allowlists them.

## Install

This package has no peer dependencies.

```bash
pnpm add @input/pen-ai-tools
```

`engines.node` is `>=22`.

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
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import {
  AIToolContextImpl,
  createAIToolTurn,
  executeAITool,
  getAIToolRuntime,
  isAIToolCallDenied,
  AI_TOOL_MAX_CALLS_PER_TURN,
  AI_TOOL_MAX_OPS_PER_CALL,
  AI_TOOL_MAX_TOTAL_OPS_PER_TURN,
} from "@input/pen-ai-tools";

const editor = createEditor({
  preset: defaultPreset(),
});
const toolRuntime = getAIToolRuntime(editor);

if (!toolRuntime) {
  throw new Error("AI tools are unavailable.");
}

const context = new AIToolContextImpl(editor, "doc-1", () => {});
const input = {
  position: "last" as const,
  blockType: "paragraph",
  content: "Hello",
};

const turn = createAIToolTurn({
  allowedMutatingTools: ["insert_block", "update_block"],
  confirm: ({ toolName }) => (toolName === "delete_block" ? "refuse" : "allow"),
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

`executeAITool` without a turn allows read-only tools only. Mutating and destructive tools require a turn whose `allowedMutatingTools` lists them. A tool classified as read-only — by an explicit `mutating: false` or by an exact catalog name in `AI_READ_ONLY_TOOL_NAMES` — is still refused at `editor.apply`: the write is dropped, a diagnostic (`ai-tool-read-only-mutation`) is emitted, and the call returns `{ ok: false, status: "blocked", reason: "tool-not-allowed" }`. Classification is a grant signal, not a description of what the handler does. `@input/pen-ai-tools` builds on the same document semantics as `@input/pen-document-ops`; it does not fork or replace them.

## Options

| Constant                         | Default | What it caps            |
| -------------------------------- | ------- | ----------------------- |
| `AI_TOOL_MAX_CALLS_PER_TURN`     | 20      | Tool calls per turn     |
| `AI_TOOL_MAX_OPS_PER_CALL`       | 32      | Ops per mutating call   |
| `AI_TOOL_MAX_TOTAL_OPS_PER_TURN` | 128     | Total ops per turn      |
| `AI_AGENTIC_MAX_STEPS_DEFAULT`   | 10      | Agentic loop `maxSteps` |

`createAIToolTurn` takes `allowedMutatingTools` (default deny), optional `confirm`, and optional `groupId`. When `groupId` is set, every metered `editor.apply` from `executeAITool` carries `{ type: "ai", groupId }` so a runaway turn is one undo step.

## Facets and commands

This package contributes no facets and no commands. It depends on the document-ops tool runtime that `defaultPreset()` installs. It requires no other extension to be imported, but `getAIToolRuntime` returns nothing until that runtime is on the editor.

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the AI features page (`#/ai`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
