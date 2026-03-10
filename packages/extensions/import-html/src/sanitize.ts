import DOMPurify from "isomorphic-dompurify";

const ALLOWED_INLINE_STYLE_PROPS = new Set([
  "color",
  "background-color",
]);

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "hr",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "a",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "del",
    "strike",
    "code",
    "pre",
    "blockquote",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "img",
    "mark",
    "span",
    "div",
    "details",
    "summary",
    "input",
  ],
  ALLOWED_ATTR: [
    "href",
    "src",
    "alt",
    "title",
    "width",
    "height",
    "class",
    "id",
    "colspan",
    "rowspan",
    "type",
    "checked",
    "disabled",
    "style",
    "start",
    "data-*",
    "open",
  ],
  ALLOW_DATA_ATTR: true,
  FORBID_TAGS: [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "applet",
    "form",
    "noscript",
    "template",
    "math",
    "svg",
  ],
  FORBID_ATTR: ["onerror", "onclick", "onload", "onmouseover"],
  RETURN_TRUSTED_TYPE: false,
};

export function sanitizeHTML(html: string): string {
  const sanitized = DOMPurify.sanitize(html, PURIFY_CONFIG) as string;
  return sanitized.replace(/\sstyle=(['"])(.*?)\1/gi, (_match, quote, value) => {
    const nextStyle = value
      .split(";")
      .map((declaration: string) => declaration.trim())
      .filter(Boolean)
      .map((declaration: string) => {
        const separatorIndex = declaration.indexOf(":");
        if (separatorIndex < 0) {
          return null;
        }
        const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
        const propertyValue = declaration.slice(separatorIndex + 1).trim();
        if (
          !ALLOWED_INLINE_STYLE_PROPS.has(property) ||
          propertyValue.length === 0
        ) {
          return null;
        }
        return `${property}: ${propertyValue}`;
      })
      .filter((declaration: string | null): declaration is string => declaration !== null)
      .join("; ");

    return nextStyle ? ` style=${quote}${nextStyle}${quote}` : "";
  });
}
