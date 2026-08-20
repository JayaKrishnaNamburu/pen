// SEC1: same admission contract as @input/pen-dom security/urlPolicy.
export type UrlContext = "link" | "image" | "media" | "download";

export interface UrlPolicy {
  resolve(rawValue: unknown, context: UrlContext): string | null;
}

const PARSE_BASE = "https://pen.invalid/";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

const ALLOWED_DATA_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
]);

function dataMediaType(parsed: URL): string {
  const rest = parsed.pathname;
  let end = rest.length;
  const semicolon = rest.indexOf(";");
  const comma = rest.indexOf(",");
  if (semicolon >= 0 && semicolon < end) {
    end = semicolon;
  }
  if (comma >= 0 && comma < end) {
    end = comma;
  }
  return rest.slice(0, end).trim().toLowerCase();
}

function resolve(rawValue: unknown, context: UrlContext): string | null {
  if (typeof rawValue !== "string") {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawValue, PARSE_BASE);
  } catch {
    // invalid url is not admitted.
    return null;
  }

  if (ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return rawValue;
  }

  if (
    parsed.protocol === "data:" &&
    context === "image" &&
    ALLOWED_DATA_IMAGE_TYPES.has(dataMediaType(parsed))
  ) {
    return rawValue;
  }

  return null;
}

export const urlPolicy: UrlPolicy = { resolve };
