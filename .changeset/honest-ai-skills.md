---
"@input/pen-ai-skills": patch
---

Drop the unused `AISkillRegistry` from the public skill-artifact surface.

The registry was an in-memory Map with no Pen or host caller. Remaining exports are the builders, renderers, and artifact types a host uses to emit `SKILL.md` bundles.
