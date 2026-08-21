import { assetProviderFacet, type PendingBlock } from "@input/pen-core";
import type {
  AssetProvider,
  DiagnosticEvent,
  Editor,
  ImportOptions,
} from "@input/pen-types";

/**
 * How remote `<img src>` URLs are handled on HTML import.
 *
 * - `"keep"`: leave the URL as-is. The imported document may depend on a
 *   remote server.
 * - `"ingest"`: fetch the image and upload it through the editor's
 *   `AssetProvider` (`assetProviderFacet`). Failed ingest emits
 *   `asset-upload-failed` and omits the image block.
 */
export type HtmlImageSrcPolicy = "keep" | "ingest";

/**
 * Default HTML `<img>` policy: remote URLs are kept as-is.
 * Today's parse behavior, made explicit (IOP4).
 */
export const DEFAULT_HTML_IMAGE_SRC_POLICY: HtmlImageSrcPolicy = "keep";

export interface HtmlImportOptions extends ImportOptions {
  /**
   * Remote `<img src>` handling. Defaults to {@link DEFAULT_HTML_IMAGE_SRC_POLICY}
   * (`"keep"`). Set `"ingest"` to route http(s) and `data:` URLs through the
   * editor's `AssetProvider`.
   */
  imageSrc?: HtmlImageSrcPolicy;
}

const INGESTIBLE_SRC_RE = /^(https?:|data:)/i;

export function isIngestibleImageSrc(src: string): boolean {
  return INGESTIBLE_SRC_RE.test(src);
}

/**
 * Apply the HTML `<img>` src policy to parsed blocks.
 *
 * `"keep"` is a no-op. `"ingest"` uploads ingestible srcs through
 * `assetProviderFacet`. Failed or oversize ingest emits
 * `asset-upload-failed` and drops that image block (no block inserted).
 */
export async function applyHtmlImageSrcPolicy(
  blocks: readonly PendingBlock[],
  editor: Editor,
  policy: HtmlImageSrcPolicy = DEFAULT_HTML_IMAGE_SRC_POLICY,
): Promise<PendingBlock[]> {
  if (policy === "keep") {
    return [...blocks];
  }

  const provider =
    (editor.facet(assetProviderFacet) as AssetProvider | null) ?? null;
  const resolved: PendingBlock[] = [];
  for (const block of blocks) {
    const next = await ingestPendingBlock(block, editor, provider);
    if (next) resolved.push(next);
  }
  return resolved;
}

async function ingestPendingBlock(
  block: PendingBlock,
  editor: Editor,
  provider: AssetProvider | null,
): Promise<PendingBlock | null> {
  const children = block.children
    ? (
        await Promise.all(
          block.children.map((child) =>
            ingestPendingBlock(child, editor, provider),
          ),
        )
      ).filter((child): child is PendingBlock => child != null)
    : undefined;

  if (block.type !== "image") {
    return children ? { ...block, children } : { ...block };
  }

  const src = typeof block.props.src === "string" ? block.props.src : "";
  if (!isIngestibleImageSrc(src)) {
    return children ? { ...block, children } : { ...block };
  }

  if (!provider) {
    emitAssetUploadFailed(editor, {
      fileName: src,
      size: 0,
      reason: "provider",
      message:
        `asset-upload-failed: cannot ingest "${src}" ` +
        "(no AssetProvider on assetProviderFacet)",
    });
    return null;
  }

  let size = 0;
  try {
    const file = await fileFromImageSrc(src);
    size = file.size;
    const maxSize = provider.maxSize;
    if (maxSize != null && file.size > maxSize) {
      emitAssetUploadFailed(editor, {
        fileName: file.name || src,
        size: file.size,
        maxSize,
        reason: "oversize",
        message:
          `asset-upload-failed: "${file.name || src}" is ${file.size} bytes, ` +
          `exceeds maxSize ${maxSize}`,
      });
      return null;
    }

    const ref = await provider.upload(file, {
      mimeType: file.type,
      ...(maxSize != null ? { maxSize } : {}),
    });
    return {
      ...block,
      props: { ...block.props, src: provider.resolve(ref) },
      children,
    };
  } catch (error) {
    emitAssetUploadFailed(editor, {
      fileName: src,
      size,
      reason: "provider",
      error,
      message:
        `asset-upload-failed: "${src}" (${size} bytes): ${errorMessage(error)}`,
    });
    return null;
  }
}

async function fileFromImageSrc(src: string): Promise<File> {
  if (src.startsWith("data:")) {
    const blob = blobFromDataUrl(src);
    return new File([blob], "image", {
      type: blob.type || "application/octet-stream",
    });
  }

  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status})`);
  }
  const blob = await response.blob();
  const name = src.split("/").pop()?.split("?")[0] || "image";
  return new File([blob], name, {
    type: blob.type || "application/octet-stream",
  });
}

function blobFromDataUrl(src: string): Blob {
  const comma = src.indexOf(",");
  if (comma === -1) {
    throw new Error("Invalid data URL");
  }
  const meta = src.slice(5, comma);
  const payload = src.slice(comma + 1);
  const mime = meta.split(";")[0] || "application/octet-stream";
  const isBase64 = /;base64/i.test(meta);
  const bytes = isBase64
    ? Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return new Blob([bytes], { type: mime });
}

function emitAssetUploadFailed(
  editor: Editor,
  event: {
    fileName: string;
    size: number;
    maxSize?: number;
    reason: "oversize" | "provider";
    error?: unknown;
    message: string;
  },
): void {
  const diagnostic: DiagnosticEvent = {
    code: "asset-upload-failed",
    level: "error",
    source: "import-html",
    message: event.message,
    remediation:
      event.reason === "oversize"
        ? "Compress the image or raise AssetProvider.maxSize."
        : "Retry ingest or keep remote URLs with imageSrc: \"keep\".",
    fileName: event.fileName,
    size: event.size,
    maxSize: event.maxSize,
    reason: event.reason,
    error: event.error,
  };
  editor.internals.emit("diagnostic", diagnostic);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}
