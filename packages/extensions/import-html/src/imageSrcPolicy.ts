import {
	assetProviderFacet,
	urlPolicy,
	type PendingBlock,
} from "@input/pen-core";
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
	/**
	 * Forwarded to `AssetProvider.upload` when `imageSrc` is `"ingest"`.
	 */
	onProgress?: (progress: number) => void;
}

/**
 * Schemes an in-memory or blob-backed `AssetProvider` legitimately returns.
 * `urlPolicy` does not admit either, so they are compared here — on the
 * parsed protocol, not the raw string.
 */
const LOCAL_PROVIDER_PROTOCOLS = new Set(["blob:", "memory:"]);

const INGESTIBLE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Whether `imageSrc: "ingest"` should fetch this src.
 *
 * Decision is on the parsed protocol, not a raw-string prefix. Relative
 * URLs are not ingestible (they are kept). `data:` is ingestible only
 * when `urlPolicy` admits it as an image.
 */
export function isIngestibleImageSrc(src: string): boolean {
	if (src.trim().length === 0) {
		return false;
	}
	let protocol: string;
	try {
		protocol = new URL(src).protocol;
	} catch {
		return false;
	}
	if (INGESTIBLE_PROTOCOLS.has(protocol)) {
		return true;
	}
	if (protocol === "data:") {
		return urlPolicy.resolve(src, "image") != null;
	}
	return false;
}

/**
 * Admit a URL the asset provider just returned.
 *
 * Everything except the local provider schemes goes through `urlPolicy`.
 * SEC1 requires the decision to be made on the parsed protocol rather than a
 * pattern over the raw string: a scheme obfuscated with entities, unicode, or
 * leading control characters slips past a regex while still parsing.
 */
export function admitProviderImageUrl(url: string): string | null {
	if (url.trim().length === 0) {
		return null;
	}
	let protocol: string;
	try {
		protocol = new URL(url, "https://pen.invalid/").protocol;
	} catch {
		return null;
	}
	if (LOCAL_PROVIDER_PROTOCOLS.has(protocol)) {
		return url;
	}
	return urlPolicy.resolve(url, "image");
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
	onProgress?: (progress: number) => void,
): Promise<PendingBlock[]> {
	if (policy === "keep") {
		return [...blocks];
	}

	const provider =
		(editor.facet(assetProviderFacet) as AssetProvider | null) ?? null;
	const resolved: PendingBlock[] = [];
	for (const block of blocks) {
		const next = await ingestPendingBlock(
			block,
			editor,
			provider,
			onProgress,
		);
		if (next) resolved.push(next);
	}
	return resolved;
}

async function ingestPendingBlock(
	block: PendingBlock,
	editor: Editor,
	provider: AssetProvider | null,
	onProgress?: (progress: number) => void,
): Promise<PendingBlock | null> {
	const children = block.children
		? (
				await Promise.all(
					block.children.map((child) =>
						ingestPendingBlock(child, editor, provider, onProgress),
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
			...(onProgress ? { onProgress } : {}),
		});
		const resolved = provider.resolve(ref);
		const admitted = admitProviderImageUrl(resolved);
		if (admitted == null) {
			emitAssetUploadFailed(editor, {
				fileName: file.name || src,
				size: file.size,
				reason: "provider",
				message: `asset-upload-failed: provider returned a blocked URL for "${src}"`,
			});
			return null;
		}
		return {
			...block,
			props: { ...block.props, src: admitted },
			children,
		};
	} catch (error) {
		emitAssetUploadFailed(editor, {
			fileName: src,
			size,
			reason: "provider",
			error,
			message: `asset-upload-failed: "${src}" (${size} bytes): ${errorMessage(error)}`,
		});
		return null;
	}
}

async function fileFromImageSrc(src: string): Promise<File> {
	let protocol: string;
	try {
		protocol = new URL(src).protocol;
	} catch {
		throw new Error("Invalid image URL");
	}
	if (protocol === "data:") {
		const blob = blobFromDataUrl(src);
		return new File([blob], "image", {
			type: blob.type || "application/octet-stream",
		});
	}
	if (protocol !== "http:" && protocol !== "https:") {
		throw new Error("Unsupported image URL protocol");
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
				: 'Retry ingest or keep remote URLs with imageSrc: "keep".',
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
