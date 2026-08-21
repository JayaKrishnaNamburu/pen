# HTML export fidelity (IOP3)

What the HTML exporter preserves for each default block, mark, and inline node. Schema `toHTML` attribute interpolations are deferred to a later S.5 slice.

Generated from `src/fidelityTable.ts` and asserted by `src/__tests__/iop3Fidelity.test.ts`. Do not edit by hand.

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
