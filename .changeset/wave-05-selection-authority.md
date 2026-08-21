---
"@input/pen-core": minor
---

Replace `SelectionManagerImpl` with `SelectionAuthority` so selection writes validate both endpoints, coalesce structurally, map through commit summaries, and keep `affinity` / `head` on the command path.
