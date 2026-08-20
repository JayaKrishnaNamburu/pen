---
"@input/pen-dom": patch
---

Add a standalone live-region announcer for editor accessibility.

`createAnnouncer` mounts one visually-hidden polite live region per editor root and rate-limits announcements per key so rapid updates do not flood assistive technology. It is not wired to conversion, undo, or selection yet.
