# Pen (by Input)
Pen is an open-source, headless, extension-first editor engine built for human–AI co-authoring.

It provides unstyled behavioral primitives, a schema-driven block system, and a tool surface that lets any LLM read, write, and manipulate documents. Pen is model-agnostic: a minimal `ModelAdapter` interface works with any LLM client — including the Vercel AI SDK and its 25+ providers — while `@pen/mcp` exposes the same tools to bidirectional protocol clients.

Pen provides headless UI primitives and you bring the design system, Pen provides headless editor primitives and you bring the experience. The rich-text toolbar, the AI command palette, the slash menu, the collaboration cursors — these are all composable, unstyled behavioral layers that consumers style and assemble.
