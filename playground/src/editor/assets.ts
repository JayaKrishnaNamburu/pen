import { memoryAssets } from "@input/pen-assets";
import { urlPolicyExtension } from "@input/pen-dom";
import type { UrlPolicy } from "@input/pen-dom";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Where pasted, dropped, and picked images go.
 *
 * An `AssetProvider` is the whole contract: store bytes, hand back a URL. This
 * one keeps the bytes in this tab and returns a `blob:` URL, which needs no
 * server and is the shortest thing that satisfies the interface. It is also why
 * an image does not survive a reload, and why a collaborator in a shared room
 * sees a broken image — a `blob:` URL only means something in the tab that made
 * it. A real host uploads to storage here and returns a URL anyone can fetch.
 *
 * `maxSize` is enforced by Pen before `upload` is called; an oversize file
 * emits an `asset-upload-failed` diagnostic and inserts no block.
 */
export const playgroundAssets = memoryAssets({ maxSize: MAX_IMAGE_BYTES });

function isBlobUrl(rawValue: unknown): rawValue is string {
	if (typeof rawValue !== "string") {
		return false;
	}
	try {
		return new URL(rawValue).protocol === "blob:";
	} catch {
		// unparsable is not a blob url, so the default policy answers for it.
		return false;
	}
}

/**
 * Lets the store's own URLs through.
 *
 * Pen resolves every URL it renders against a policy, and the default one
 * admits `http(s):` and `data:` images — not the `blob:` URLs this store hands
 * back, so without this an uploaded image renders as an empty box.
 *
 * What makes the widening safe is that a `blob:` URL cannot execute in an
 * `<img src>`, not where it came from: this admits any well-formed `blob:`
 * value, not only the ones `playgroundAssets` minted. Only the `image` context
 * is widened; every other value is delegated to the default policy, so `blob:`
 * stays rejected for links.
 */
export const blobImageUrlExtension = urlPolicyExtension(
	(defaultPolicy): UrlPolicy => ({
		resolve: (rawValue, context) =>
			context === "image" && isBlobUrl(rawValue)
				? rawValue
				: defaultPolicy.resolve(rawValue, context),
	}),
);
