---
"@input/pen-ai": patch
---

Stage tool-channel `edit_document` applies when the route mutation mode is suggestion-like, so direct vs reviewed stays a parameter on the shared apply wrap (`spec-better-ai/01-edit-channel.md` EC11). XML remains the default channel (EC12). Allowlisting, undo grouping, and `origin: "ai"` are unchanged (EC13).
