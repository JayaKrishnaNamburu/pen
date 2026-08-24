---
"@input/pen-ai": patch
---

Drop unused skill builders and `renderSkillMarkdown` from the public barrel. Hosts already reach this package through `listDefaultAISkills` and `renderSkillFiles`; the rest had no caller.
