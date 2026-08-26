---
"@input/pen-ai": patch
"@input/pen-react": patch
---

Retire the structured-plan text channel. A durable AI mutation is no longer derived from parsing the assistant text stream: the planner prompt, the plan parse, and the streamed plan preview are gone, and `set_block_props` / `format_text` on `edit_document` carry block conversions and mark changes instead. `AIPlannerMode` and `AI_PLANNER_MODES` are removed from the public API, and `route.plannerMode` no longer exists.

Removed capability: previews of a partially-arrived plan. That preview parsed half-written JSON out of a text stream, which a tool call cannot produce — a tool call arrives complete. Staged edits still surface through suggestions.
