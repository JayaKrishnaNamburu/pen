export function isClearDocumentPrompt(prompt: string): boolean {
	const normalizedPrompt = prompt.trim().toLowerCase();
	return (
		/\b(remove|delete|clear|erase|wipe)\b/.test(normalizedPrompt) &&
		/\b(all|entire|whole|everything)\b/.test(normalizedPrompt) &&
		/\b(document|content|contents|text|story|page)\b/.test(normalizedPrompt)
	);
}

export function isWholeDocumentRewritePrompt(prompt: string): boolean {
	const normalizedPrompt = prompt.trim().toLowerCase();
	return (
		/\b(rewrite|redo|revise|rework|replace)\s+(?:the|this|my)?\s*(?:entire|whole|full|all)?\s*(?:document|content|contents|text|story|page)\b/.test(
			normalizedPrompt,
		) || /\bmake (?:it|this) about\b/.test(normalizedPrompt)
	);
}

export function isDocumentResetPrompt(prompt: string): boolean {
	const normalizedPrompt = prompt.trim().toLowerCase();
	return /\b(start(?:ing)?\s+(?:over|again|from scratch)|begin\s+again|from scratch|restart)\b/.test(
		normalizedPrompt,
	);
}

export function isDocumentFollowUpEditPrompt(prompt: string): boolean {
	const normalizedPrompt = prompt.trim().toLowerCase();
	if (
		/\b(continue|append|add|insert|another|more|next)\b/.test(
			normalizedPrompt,
		)
	) {
		return false;
	}
	return (
		/\b(change|update|adjust|edit|fix|improve|polish|revise|rework|rename|retitle|make)\b/.test(
			normalizedPrompt,
		) &&
		(/\b(title|heading|story|document|content|contents|text|tone|voice|ending|opening|intro|introduction|theme)\b/.test(
			normalizedPrompt,
		) ||
			/\bmake (?:it|this)\b/.test(normalizedPrompt))
	);
}
