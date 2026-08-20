# XML export fidelity (IOP3)

XML is a lossless interchange format layered on the JSON document model. Schema-known blocks, props, marks, inline nodes, and structured table payloads round-trip.

Generated from `src/fidelityTable.ts` and asserted by `src/__tests__/iop3Fidelity.test.ts`. Do not edit by hand.

| Kind | Type | Fidelity | Notes |
| --- | --- | --- | --- |
| block | paragraph | full |  |
| block | heading | full |  |
| block | bulletListItem | full |  |
| block | numberedListItem | full |  |
| block | checkListItem | full |  |
| block | codeBlock | full |  |
| block | image | full |  |
| block | table | full |  |
| block | divider | full |  |
| block | callout | full |  |
| block | toggle | full |  |
| block | blockquote | full |  |
| block | subdocument | full |  |
| mark | bold | full |  |
| mark | italic | full |  |
| mark | underline | full |  |
| mark | strikethrough | full |  |
| mark | highlight | full |  |
| mark | textColor | full |  |
| mark | backgroundColor | full |  |
| mark | link | full |  |
| mark | code | full |  |
| inline-node | mention | full |  |
| inline-node | inlineApp | full |  |
