import { urlPolicy, type UrlContext } from "@input/pen-core";

const FENCED_CODE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`]*`/g;
const HTML_URL_ATTR = /\s(href|src)=(?:"([^"]*)"|'([^']*)')/gi;

export function admitMarkdownUrls(markdown: string): string {
  return rewriteSegments(markdown, FENCED_CODE, (prose) =>
    rewriteSegments(prose, INLINE_CODE, admitDestinations),
  );
}

function rewriteSegments(
  text: string,
  pattern: RegExp,
  rewrite: (segment: string) => string,
): string {
  const global = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
  );
  let result = "";
  let lastIndex = 0;
  for (const match of text.matchAll(global)) {
    const index = match.index ?? 0;
    result += rewrite(text.slice(lastIndex, index));
    result += match[0];
    lastIndex = index + match[0].length;
  }
  return result + rewrite(text.slice(lastIndex));
}

function admitDestinations(text: string): string {
  return admitHtmlUrlAttributes(admitMarkdownLinks(text));
}

function admitMarkdownLinks(text: string): string {
  let result = "";
  let index = 0;
  while (index < text.length) {
    const open = findNextLinkOpen(text, index);
    if (open == null) {
      return result + text.slice(index);
    }
    result += text.slice(index, open.start);
    const parsed = parseDestination(text, open.destStart);
    if (parsed == null) {
      result += text.slice(open.start, open.destStart);
      index = open.destStart;
      continue;
    }
    const context: UrlContext = open.image ? "image" : "link";
    const admitted = urlPolicy.resolve(parsed.dest, context);
    if (admitted == null) {
      result += open.image ? "" : open.label;
    } else {
      result += `${open.image ? "!" : ""}[${open.label}](${admitted}${parsed.title})`;
    }
    index = parsed.end;
  }
  return result;
}

function findNextLinkOpen(
  text: string,
  from: number,
): { start: number; destStart: number; label: string; image: boolean } | null {
  let search = from;
  while (search < text.length) {
    const destOpen = text.indexOf("](", search);
    if (destOpen === -1) {
      return null;
    }
    const labelOpen = text.lastIndexOf("[", destOpen);
    if (labelOpen < from) {
      search = destOpen + 2;
      continue;
    }
    const image = labelOpen > 0 && text[labelOpen - 1] === "!";
    return {
      start: image ? labelOpen - 1 : labelOpen,
      destStart: destOpen + 2,
      label: text.slice(labelOpen + 1, destOpen),
      image,
    };
  }
  return null;
}

function parseDestination(
  text: string,
  destStart: number,
): { dest: string; title: string; end: number } | null {
  let depth = 1;
  let index = destStart;
  let inQuote = false;
  while (index < text.length && depth > 0) {
    const char = text[index];
    if (char === '"' && text[index - 1] !== "\\") {
      inQuote = !inQuote;
    } else if (!inQuote) {
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
      }
    }
    index += 1;
  }
  if (depth !== 0) {
    return null;
  }

  const inside = text.slice(destStart, index - 1);
  const titleMatch = /^(.*?)\s+("[^"]*")$/.exec(inside);
  if (titleMatch) {
    return { dest: titleMatch[1]!, title: ` ${titleMatch[2]}`, end: index };
  }
  return { dest: inside, title: "", end: index };
}

function admitHtmlUrlAttributes(text: string): string {
  return text.replace(
    HTML_URL_ATTR,
    (
      _match,
      name: string,
      doubleQuoted: string | undefined,
      singleQuoted: string | undefined,
    ) => {
      const raw = doubleQuoted ?? singleQuoted ?? "";
      const context: UrlContext = name.toLowerCase() === "src" ? "image" : "link";
      const admitted = urlPolicy.resolve(raw, context);
      if (admitted == null) {
        return "";
      }
      const quote = doubleQuoted != null ? `"` : `'`;
      return ` ${name}=${quote}${admitted}${quote}`;
    },
  );
}
