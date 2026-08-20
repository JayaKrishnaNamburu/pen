import { describe, expect, it, vi, afterEach } from "vitest";
import { createEditor } from "@input/pen-core";
import type { AssetProvider, DiagnosticEvent } from "@input/pen-types";
import { createDefaultSchema } from "@input/pen-schema-default";
import { htmlImporter } from "../importer";
import {
	DEFAULT_HTML_IMAGE_SRC_POLICY,
	isIngestibleImageSrc,
} from "../imageSrcPolicy";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const defaultRegistry = createDefaultSchema();

function editorWithProvider(provider?: AssetProvider) {
	const editor = createEditor({
		schema: defaultRegistry,
		preset: noDefaultExtensionsPreset,
	});
	if (provider) {
		editor.internals.setSlot("paste:assetProvider", provider);
	}
	return editor;
}

function stubProvider(overrides: Partial<AssetProvider> = {}) {
	const upload = vi.fn(
		overrides.upload ??
			(async (file: File | Blob) => ({
				id: "ingested",
				url: "memory://ingested.png",
				mimeType: "image/png",
				size: file.size,
			})),
	);
	const provider: AssetProvider = {
		resolve(ref) {
			return ref.url;
		},
		async delete() {},
		...overrides,
		upload,
	};
	return { provider, upload };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("IOP4 HTML img src policy", () => {
	it("IOP4 defaults to keeping remote img URLs as-is", () => {
		expect(DEFAULT_HTML_IMAGE_SRC_POLICY).toBe("keep");
		expect(isIngestibleImageSrc("https://cdn.example/a.png")).toBe(true);
	});

	it("IOP4 keep setting leaves remote img src unchanged and does not call the provider", async () => {
		const { provider, upload } = stubProvider();
		const editor = editorWithProvider(provider);
		const remote = "https://cdn.example/keep.png";

		await htmlImporter.import(
			`<img src="${remote}" alt="remote" />`,
			editor,
			{ imageSrc: "keep" },
		);

		const images = [...editor.blocks("image")];
		expect(images).toHaveLength(1);
		expect(images[0]?.props.src).toBe(remote);
		expect(upload).not.toHaveBeenCalled();
		editor.destroy();
	});

	it("IOP4 default import keeps remote img src (no ingest)", async () => {
		const { provider, upload } = stubProvider();
		const editor = editorWithProvider(provider);
		const remote = "https://cdn.example/default.png";

		await htmlImporter.import(`<img src="${remote}" alt="remote" />`, editor);

		const images = [...editor.blocks("image")];
		expect(images).toHaveLength(1);
		expect(images[0]?.props.src).toBe(remote);
		expect(upload).not.toHaveBeenCalled();
		editor.destroy();
	});

	it("IOP4 ingest setting routes remote img src through the asset provider", async () => {
		const { provider, upload } = stubProvider();
		const editor = editorWithProvider(provider);
		const remote = "https://cdn.example/ingest.png";
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				new Response(new Uint8Array([1, 2, 3, 4]), {
					headers: { "content-type": "image/png" },
				}),
			),
		);

		await htmlImporter.import(
			`<img src="${remote}" alt="remote" />`,
			editor,
			{ imageSrc: "ingest" },
		);

		expect(fetch).toHaveBeenCalledWith(remote);
		expect(upload).toHaveBeenCalledTimes(1);
		const images = [...editor.blocks("image")];
		expect(images).toHaveLength(1);
		expect(images[0]?.props.src).toBe("memory://ingested.png");
		editor.destroy();
	});

	it("IOP4 ingest failure emits asset-upload-failed and inserts no image block", async () => {
		const { provider } = stubProvider({
			upload: vi.fn().mockRejectedValue(new Error("cdn denied")),
		});
		const editor = editorWithProvider(provider);
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				new Response(new Uint8Array([1, 2, 3, 4]), {
					headers: { "content-type": "image/png" },
				}),
			),
		);

		await htmlImporter.import(
			'<img src="https://cdn.example/fail.png" alt="remote" />',
			editor,
			{ imageSrc: "ingest" },
		);

		expect([...editor.blocks("image")]).toHaveLength(0);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]).toMatchObject({
			code: "asset-upload-failed",
			level: "error",
			source: "import-html",
		});
		expect(diagnostics[0]?.message).toContain("cdn denied");
		editor.destroy();
	});
});
