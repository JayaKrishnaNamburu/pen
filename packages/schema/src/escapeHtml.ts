const HTML_ESCAPE_PATTERN = /[&<>"']/g;

const HTML_ESCAPE_REPLACEMENTS: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/** SEC5: escape document values before they enter markup text or attributes. */
export function escapeHtml(value: string): string {
  return value.replace(
    HTML_ESCAPE_PATTERN,
    (character) => HTML_ESCAPE_REPLACEMENTS[character] ?? character,
  );
}
