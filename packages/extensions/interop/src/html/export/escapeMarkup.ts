const MARKUP_ESCAPE_PATTERN = /[&<>"']/g;

const MARKUP_ESCAPE_REPLACEMENTS: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&apos;",
};

function escapeMarkup(value: string): string {
	return value.replace(
		MARKUP_ESCAPE_PATTERN,
		(character) => MARKUP_ESCAPE_REPLACEMENTS[character] ?? character,
	);
}

/** SEC5: escape document text before it enters a markup text node. */
export function escapeMarkupText(value: string): string {
	return escapeMarkup(value);
}

/** SEC5: escape document values before they enter a markup attribute. */
export function escapeMarkupAttribute(value: string): string {
	return escapeMarkup(value);
}
