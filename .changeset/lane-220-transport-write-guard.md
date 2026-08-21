---
"@input/pen-transport-direct": patch
"@input/pen-transport-sse": patch
"@input/pen-import-html": patch
---

Restore `editor.apply` when an AI tool stream is abandoned, and decide provider image URLs on the parsed protocol.

The direct transport installed a write guard for the duration of a tool call and
removed it in a `catch`. Abandoning the stream mid-tool — what a host does when
the user presses stop — resumes the generator with a return completion, which
runs `finally` and skips `catch`, so the guard stayed installed and every later
`editor.apply` was silently discarded. Both transports now restore in a
`finally`.

`admitProviderImageUrl` matched hostile schemes with a regex over the raw string
and returned anything else verbatim, admitting `file:` and other non-ingestible
schemes. It now parses the URL and admits only `blob:` / `memory:` directly,
routing everything else through `urlPolicy` (SEC1).
