---
"@input/pen-ai": patch
"@input/pen-core": patch
"@input/pen-dom": patch
"@input/pen-interop": patch
"@input/pen-react": patch
---

Use the documented HOST4 floor fallbacks for replaceChildren, Object.hasOwn, and Array.prototype.at so hosts without those APIs still empty drag-preview roots, parse clipboard payloads, and resolve URL policy and AI replacements.
