# Wave 6 — AI Tools, Skills & M0 Integration

**Milestone:** M0 · **Packages:** `@pen/ai-tools`, `@pen/ai-skills`, `@pen/bench` · **Depends on:** Waves 0-5

---

## Goal

Ship the package-first agent integration layer for Pen.

After this wave:

- Pen exposes a canonical native tool surface through `@pen/ai-tools`
- external agent runtimes consume packaged skill artifacts through `@pen/ai-skills`
- benchmark coverage remains part of the M0 release bar

This wave deliberately does not introduce a protocol bridge. Tool access stays native, typed, and package-first.

---

## Package 1: `@pen/ai-tools`

`@pen/ai-tools` is the public agent/tool package that sits on top of the editor-attached `ToolRuntime` installed by `createEditor()`.

### Responsibilities

- Resolve the active tool runtime from a Pen editor
- List tool descriptors for agent runtimes
- Execute tools and normalize buffered async output
- Re-export advanced tool context/runtime helpers where needed for hosted execution

### Public API

```ts
import { createEditor } from "@pen/core";
import {
  getAIToolRuntime,
  listAITools,
  executeAITool,
  collectAIToolOutput,
} from "@pen/ai-tools";
```

### Design Rules

- Reuse `@pen/document-ops` and `@pen/content-ops` for document semantics
- Do not duplicate mutation logic in `@pen/ai-tools`
- Keep the package transport-friendly and environment-agnostic

---

## Package 2: `@pen/ai-skills`

`@pen/ai-skills` packages the same native tool surface into agent-facing skill artifacts.

### Responsibilities

- Define skill metadata and registries
- Render `SKILL.md`-style artifacts for agent runtimes
- Attach optional helper scripts and references
- Treat `@pen/ai-tools` as the execution source of truth

### Public API

```ts
import { listDefaultAISkills, renderSkillFiles } from "@pen/ai-skills";
```

### Design Rules

- Skills are distribution artifacts, not the execution engine
- Skill instructions should reference the native `@pen/ai-tools` surface
- Keep artifacts simple enough to be embedded into agent-specific install flows

---

## Package 3: `@pen/bench`

Wave 6 continues to require benchmark coverage for M0:

- native tool listing and execution should remain measurable
- buffered tool output should not regress memory/latency budgets
- benchmark governance remains part of the release bar

---

## Acceptance Criteria

- `@pen/ai-tools` exists and is the documented public tool package
- `@pen/ai-skills` exists and can render real skill artifacts from tool descriptors
- the playground demonstrates native tool routes and skill artifact routes
- benchmarks still run in CI as part of the M0 gate
