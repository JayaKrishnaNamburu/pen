# Security Policy

The load-bearing defense is render-time URL policy (`urlPolicy`, rule
SEC1), not the HTML sanitizer. A host that reads this file and stops
sanitizing its own input has removed a control Pen does not replace.

Pen has never been published. There are no git tags, no `CHANGELOG.md`
files, and nothing on the public npm registry. Reports are accepted
against the development line on the default branch.

## What Is Not Guaranteed

- Pen does not encrypt content, authenticate peers, or decide who may
  write. The host and the transport own access. Pen's job is to render
  arbitrary written state without turning stored strings into live
  script.
- Custom block renderers are host code. A renderer that injects HTML
  is outside this boundary.
- The `pen.readOnly` facet sets `aria-readonly` only. It does not
  decline typing, does not stop `editor.apply`, and does not stop the
  wire. The `readonly` prop on `EditorRoot`, `PenEditor`, or
  `mountEditor` is what declines local typing and pointer activation.
  Neither the facet nor the prop is a write gate. That split is an
  open owner decision, not a finished design.

## Content Ingresses

External content reaches the live DOM through many ingresses. Only
two of them call `sanitizeHTML` (DOMPurify via `isomorphic-dompurify`,
owned by `@input/pen-interop/html`):

1. paste `text/html` (via `htmlImporter.parse` / `htmlImporter.import`)
2. the HTML import API (`htmlImporter.import` / `parseHtmlToBlocks`)

These ingresses do **not** pass the sanitizer. That is by design:

- Pen-blocks JSON (`application/x-pen-blocks+json`, the legacy
  `application/x-pen-blocks` flavor, and the HTML `data-pen-blocks`
  embed)
- plain-text paste
- Markdown paste and the Markdown import API
- the JSON import API
- the XML import API
- file drag-and-drop and image transfer
- AI, stream, and tools writes
- remote collaborator Yjs updates
- asset upload and resolve
- the host's own initial document

Schema validation and ingest bounds are not HTML sanitization. A
`javascript:` href written through any of those paths never meets
DOMPurify. Render-time `urlPolicy` is what keeps it off the live DOM.

Do not treat a successful HTML import as evidence that Markdown
paste, JSON import, or a collaborator update was sanitized. They
were not.

## URL Policy

`urlPolicy` lives in `@input/pen-core`. Default admission is `http:`,
`https:`, `mailto:`, `tel:`, and relative URLs. `data:image/` of
`png`, `jpeg`, `gif`, `webp`, or `avif` is allowed in image context
only. `javascript:`, `vbscript:`, `file:`, `data:text/html`, and
non-strings resolve to `null`. A blocked URL renders without the
URL-bearing attribute and with `data-pen-blocked-url=""`. The raw
URL is not echoed.

Hosts that need extra schemes wrap the default through
`urlPolicyExtension` (`pen.urlPolicy`). Not every sink reads the
host facet: the HTML and XML exporters call the default policy
directly. A wrap that denies a URL can still emit it from those
two exporters.

## Other Library Boundaries

- Library rendering builds DOM through `createElement` /
  `textContent` / attribute setters. Parsing untrusted HTML uses
  `DOMParser` in `@input/pen-interop/html`; that tree enters the
  document as data.
- `@input/pen-tools` validates tool payloads before building
  ops. Invalid payloads emit a diagnostic and are not applied. Tool
  authority is a live boundary, not a claim that every write path
  is closed.
- `@input/pen-search` defaults `regex: false`, caps query length at
  1,024 characters, and budgets regex execution.

## Reporting A Vulnerability

Do not open a public GitHub issue for a suspected vulnerability.

The working route today is email: `support@input.so` with
`Pen security` in the subject line. That mailbox is the same
contact published in `CLA.md`. GitHub private vulnerability
reporting is **not enabled** on this repository; the Security tab
has no private advisory form.

Include:

- a description of the issue
- impact and affected packages or commit
- reproduction steps or a proof of concept
- any suggested remediation if you have one

We will acknowledge reports as quickly as we can.

## Coordinated Disclosure

The default coordinated-disclosure window is 90 days from the first
maintainer acknowledgement. We may ask to extend that window for a
complex fix. We will not publish before a fix is available unless
the reporter and maintainers agree, or the issue is already public.

## Advisories

Once packages are on the public registry, we will publish GitHub
Security Advisories, and npm advisories for those packages, for
vulnerabilities reachable through the SEC1–SEC6 surfaces:

- SEC1: render-time URL policy (hostile URL-bearing document state)
- SEC2: HTML injection sinks in library code
- SEC3: the HTML sanitizer used for import and paste
- SEC4: structured clipboard and JSON ingestion
- SEC5: exporter and serializer escaping
- SEC6: tool and document-op payload validation

Host-owned code, custom renderers, and trusted host configuration
are outside Pen's advisory boundary.

## Supported Versions

Until the first release train is published, only the default-branch
development line is accepted.

| Version            | Supported |
| ------------------ | --------- |
| Default branch     | Yes       |
| Published 2.x      | none yet  |
| Older lines / tags | n/a       |

After 2.0 is published, the intended policy is: latest 2.x minor
only. That table is not in force today.

## Scope

This policy applies to the Pen repository, its packages once
published, and the repository playground/docs apps when the issue
affects shipped package behavior.
