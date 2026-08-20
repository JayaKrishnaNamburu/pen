# Security Policy

## Supported Versions

Security fixes land on the latest v2 minor only.

| Version          | Supported |
| ---------------- | --------- |
| Latest 2.x minor | Yes       |
| Older 2.x minors | No        |
| 1.x and 0.x      | No        |

Until 2.0 is published, reports against the current development line on the
default branch are accepted and fixed there.

## Reporting A Vulnerability

Please do not open public GitHub issues for suspected security vulnerabilities.

Preferred channel: GitHub private vulnerability reporting on this repository
(Security → Report a vulnerability). That creates a private advisory the
maintainers can coordinate against.

Fallback: email `support@input.so` with `Pen security` in the subject line.

Include:

- a description of the issue
- impact and affected packages or versions
- reproduction steps or a proof of concept
- any suggested remediation if you have one

We will acknowledge reports as quickly as we can.

## Coordinated Disclosure

The default coordinated-disclosure window is 90 days from the first maintainer
acknowledgement. We may ask to extend that window for a complex fix. We will
not publish before a fix is available unless the reporter and maintainers
agree, or the issue is already public.

## Advisories

We publish GitHub Security Advisories, and npm advisories for published
packages, for vulnerabilities reachable through the SEC1–SEC6 surfaces:

- SEC1: render-time URL policy (hostile URL-bearing document state)
- SEC2: HTML injection sinks in library code
- SEC3: the HTML sanitizer used for import and paste
- SEC4: structured clipboard and JSON ingestion
- SEC5: exporter and serializer escaping
- SEC6: tool and document-op payload validation

Host-owned code, custom renderers, and trusted host configuration are outside
Pen's advisory boundary.

## Scope

This policy applies to the Pen repository, its published packages, and the
repository playground/docs apps when the issue affects shipped package
behavior.
