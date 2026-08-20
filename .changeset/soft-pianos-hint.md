---
"@input/pen-react": patch
---

Declare the React client boundary so App Router hosts can import PenEditor from Server Components.

Published `@input/pen-react` entries now ship `"use client"` in both ESM and CJS, so hosts no longer wrap every import themselves.
