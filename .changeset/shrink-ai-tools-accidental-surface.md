---
"@input/pen-ai": minor
---

Stop re-exporting the tool-runtime slot from the package barrel. Hosts use getAIToolRuntime; the slot key lives on @input/pen-document-ops as DOCUMENT_OPS_TOOL_RUNTIME_SLOT.
