---
"@input/pen-dom": patch
---

Admit link mark hrefs through the render-time URL policy.

Blocked schemes such as `javascript:` no longer land as live DOM hrefs. The anchor is rendered without `href` and with `data-pen-blocked-url`.
