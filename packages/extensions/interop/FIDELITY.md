# HTML export fidelity (IOP3)

What the HTML exporter preserves for each default block, mark, and inline node. Schema `toHTML` attribute interpolations are deferred to a later S.5 slice.

Generated from `src/html/export/fidelityTable.ts` and asserted by `src/html/export/__tests__/iop3Fidelity.test.ts`. Do not edit by hand.

| Kind | Type | Fidelity | Notes |
| --- | --- | --- | --- |
| block | paragraph | full |  |
| block | heading | full |  |
| block | bulletListItem | full |  |
| block | numberedListItem | degraded | start offset dropped; items wrap in ol |
| block | checkListItem | full |  |
| block | codeBlock | full |  |
| block | image | degraded | caption dropped; hostile src omitted (SEC1) |
| block | table | full |  |
| block | divider | full |  |
| block | callout | degraded | children exported as sibling blocks, not nested in the callout div |
| block | toggle | degraded | children exported as sibling blocks, not nested in details |
| block | blockquote | full |  |
| block | subdocument | degraded | empty data-pen-subdocument marker; nested document dropped |
| mark | bold | full |  |
| mark | italic | full |  |
| mark | underline | full |  |
| mark | strikethrough | full |  |
| mark | highlight | full |  |
| mark | textColor | full |  |
| mark | backgroundColor | full |  |
| mark | link | full | hostile href omitted (SEC1) |
| mark | code | full |  |
| inline-node | mention | dropped | non-string inserts omitted |
| inline-node | inlineApp | dropped | non-string inserts omitted |
# JSON export fidelity (IOP3)

JSON is the lossless interchange format for schema-known document content: blocks, props, marks, inline nodes, and structured table payloads. Unknown props are preserved (DUR3). Metadata is included when requested. Apps are not part of this exporter.

Generated from `src/json/export/fidelityTable.ts` and asserted by `src/json/export/__tests__/iop3Fidelity.test.ts`. Do not edit by hand.

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
| block | subdocument | degraded | subdocumentGuid is reassigned on import |
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
# Markdown export fidelity (IOP3)

Pen markdown is GitHub-flavored Markdown for blocks with a standard representation, plus Pen-specific constructs for the rest. A non-Pen reader sees GFM for headings, lists, code, tables, images, and emphasis. Subdocument and toggle become HTML comments or raw HTML.

Generated from `src/markdown/export/fidelityTable.ts` and asserted by `src/markdown/export/__tests__/iop3Fidelity.test.ts`. Do not edit by hand.

| Kind | Type | Fidelity | Notes |
| --- | --- | --- | --- |
| block | paragraph | full |  |
| block | heading | full |  |
| block | bulletListItem | full |  |
| block | numberedListItem | full |  |
| block | checkListItem | full |  |
| block | codeBlock | full |  |
| block | image | degraded | caption dropped; hostile src omitted (SEC1) |
| block | table | full | GFM pipe-table; tables without a header row fall back to HTML |
| block | divider | full |  |
| block | callout | degraded | blockquote with Note/Warning/Error prefix; children exported as sibling blocks |
| block | toggle | degraded | raw HTML details (Pen-specific); children exported as sibling blocks |
| block | blockquote | full |  |
| block | subdocument | dropped | comment marker only; nested document dropped |
| mark | bold | full |  |
| mark | italic | full |  |
| mark | underline | degraded | raw <u> HTML |
| mark | strikethrough | full |  |
| mark | highlight | degraded | ==text== (not CommonMark) |
| mark | textColor | dropped |  |
| mark | backgroundColor | dropped |  |
| mark | link | full | hostile href omitted (SEC1) |
| mark | code | full |  |
| inline-node | mention | dropped | non-string inserts omitted |
| inline-node | inlineApp | dropped | non-string inserts omitted |
# XML export fidelity (IOP3)

XML is a lossless interchange format layered on the JSON document model. Schema-known blocks, props, marks, inline nodes, and structured table payloads round-trip.

Generated from `src/xml/fidelityTable.ts` and asserted by `src/xml/__tests__/iop3Fidelity.test.ts`. Do not edit by hand.

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
