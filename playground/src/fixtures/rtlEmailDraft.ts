import { generateId, type Editor } from "@input/pen-types";

const RTL_EMAIL_DRAFT_SLUG = "rtl-email";

export function isRtlEmailDraftLocation(): boolean {
	const hash = window.location.hash.replace(/^#\/?/, "");
	if (hash === RTL_EMAIL_DRAFT_SLUG) {
		return true;
	}
	return window.location.pathname === `/${RTL_EMAIL_DRAFT_SLUG}`;
}

export function applyRtlEmailDraft(editor: Editor): void {
	const headingId = editor.firstBlock()?.id;
	if (!headingId) {
		return;
	}

	const greetingId = generateId();
	const bodyId = generateId();
	const numbersId = generateId();
	const quoteId = generateId();
	const closeId = generateId();

	editor.apply(
		[
			{
				type: "set-props", blockId: headingId, props: { type: "heading", ...{ level: 1 }, direction: "rtl" },
			},
			{
				type: "splice-text",
				blockId: headingId,
				from: 0,
				to: 0,
				insert: "مسودة: Re: Q3 planning — Input",
			},
			{
				type: "insert-block",
				blockId: greetingId,
				blockType: "paragraph",
				props: { direction: "rtl" },
				position: { after: headingId },
			},
			{
				type: "splice-text",
				blockId: greetingId,
				from: 0,
				to: 0,
				insert: "مرحباً Nora،",
			},
			{
				type: "insert-block",
				blockId: bodyId,
				blockType: "paragraph",
				props: { direction: "rtl" },
				position: { after: greetingId },
			},
			{
				type: "splice-text",
				blockId: bodyId,
				from: 0,
				to: 0,
				insert: "راجعنا ملف Q3 roadmap في Notion وأرسلنا الملخص إلى ops@input.dev. الموعد المقترح 24 Aug 2026.",
			},
			{
				type: "insert-block",
				blockId: numbersId,
				blockType: "paragraph",
				props: { direction: "rtl" },
				position: { after: bodyId },
			},
			{
				type: "splice-text",
				blockId: numbersId,
				from: 0,
				to: 0,
				insert: "الرابط: https://input.dev/q3 — الرقم المرجعي INV-4821.",
			},
			{
				type: "insert-block",
				blockId: quoteId,
				blockType: "blockquote",
				props: { direction: "ltr" },
				position: { after: numbersId },
			},
			{
				type: "splice-text",
				blockId: quoteId,
				from: 0,
				to: 0,
				insert: "Sounds good — I'll send the calendar hold after legal reviews the MSA.",
			},
			{
				type: "insert-block",
				blockId: closeId,
				blockType: "paragraph",
				props: { direction: "rtl" },
				position: { after: quoteId },
			},
			{
				type: "splice-text",
				blockId: closeId,
				from: 0,
				to: 0,
				insert: "شكراً، نورة",
			},
		],
		{ origin: "system" },
	);
}
