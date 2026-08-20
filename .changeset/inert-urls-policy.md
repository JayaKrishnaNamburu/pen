---
"@input/pen-dom": patch
"@input/pen-react": patch
---

Admit rendered image URLs through a shared SEC1 policy.

`@input/pen-dom` now exports `urlPolicy.resolve` so hostile schemes never become live `src` values. The React image renderer omits `src` and sets `data-pen-blocked-url` when the value is inert.
