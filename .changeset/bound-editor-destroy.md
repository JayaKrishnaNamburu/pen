---
"@input/pen-core": patch
"@input/pen-types": patch
---

Make `editor.destroy()` awaitable and clear block revisions on teardown.

Queued extension deactivation used to be fire-and-forget, so hosts could not wait for it and long-lived editors kept per-block revision entries after destroy. The returned promise settles when teardown finishes; callers that ignore it stay correct. Core destroy still does not tear down an attached field editor.
