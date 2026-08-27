import { describe, expect, it } from "vitest";
import { memoryAssets } from "../index";

describe("AC 20 — memoryAssets", () => {
  it("upload returns a valid AssetRef", async () => {
    const provider = memoryAssets();
    const blob = new Blob(["hello"], { type: "text/plain" });
    const ref = await provider.upload(blob, { mimeType: "text/plain" });

    expect(ref.id).toBeTruthy();
    expect(ref.url).toBeTruthy();
    expect(ref.mimeType).toBe("text/plain");
    expect(ref.size).toBe(blob.size);
  });

  it("resolve returns a usable URL", async () => {
    const provider = memoryAssets();
    const blob = new Blob(["hello"], { type: "text/plain" });
    const ref = await provider.upload(blob);

    const url = provider.resolve(ref);
    expect(url).toBeTruthy();
    expect(typeof url).toBe("string");
  });

  it("resolve returns ref.url for unknown ref", () => {
    const provider = memoryAssets();
    const fakeRef = {
      id: "unknown-id",
      url: "https://example.com/file.txt",
      mimeType: "text/plain",
      size: 100,
    };
    expect(provider.resolve(fakeRef)).toBe("https://example.com/file.txt");
  });

  it("delete removes from store", async () => {
    const provider = memoryAssets();
    const blob = new Blob(["hello"], { type: "text/plain" });
    const ref = await provider.upload(blob);

    await provider.delete(ref);

    expect(provider.resolve(ref)).toBe(ref.url);
  });

  it("IOP4 API10 successful upload is unchanged", async () => {
    const provider = memoryAssets();
    const blob = new Blob(["hello"], { type: "text/plain" });
    const ref = await provider.upload(blob, { mimeType: "text/plain" });

    expect(ref.mimeType).toBe("text/plain");
    expect(ref.size).toBe(blob.size);
    expect(provider.resolve(ref)).toBeTruthy();
  });

  it("IOP4 API10 observes onProgress during upload", async () => {
    const provider = memoryAssets();
    const blob = new Blob(["hello"], { type: "text/plain" });
    const progress: number[] = [];
    await provider.upload(blob, {
      onProgress: (p) => {
        progress.push(p);
      },
    });
    expect(progress).toEqual([0, 1]);
  });

  it("IOP4 API10 rejects oversize uploads naming the limit and actual size", async () => {
    const provider = memoryAssets({ maxSize: 4 });
    const blob = new Blob(["hello-world"], { type: "text/plain" });

    await expect(provider.upload(blob, { maxSize: 4 })).rejects.toThrow(
      /11.*maxSize 4/,
    );
  });

  it("IOP4 API10 rejectUpload is a failure double and does not store", async () => {
    const provider = memoryAssets({
      rejectUpload: new Error("storage down"),
    });
    const blob = new Blob(["hello"], { type: "text/plain" });
    const progress: number[] = [];

    await expect(
      provider.upload(blob, {
        onProgress: (value) => {
          progress.push(value);
        },
      }),
    ).rejects.toThrow("storage down");
    expect(progress).toEqual([]);
  });

  it("IOP4 mid-transfer rejectAfterProgress fires onProgress(0) and does not store", async () => {
    const provider = memoryAssets({
      rejectAfterProgress: new Error("socket reset"),
    });
    const blob = new Blob(["hello"], { type: "text/plain" });
    const progress: number[] = [];

    await expect(
      provider.upload(blob, {
        onProgress: (value) => {
          progress.push(value);
        },
      }),
    ).rejects.toThrow("socket reset");
    expect(progress).toEqual([0]);

    const leaked = {
      id: "missing",
      url: "https://example.com/leaked",
      mimeType: "text/plain",
      size: blob.size,
    };
    expect(provider.resolve(leaked)).toBe("https://example.com/leaked");
  });

  it("IOP4 uploadUrl override is stored as-is (importer admits, this double does not)", async () => {
    const provider = memoryAssets({
      uploadUrl: "javascript:alert(1)",
    });
    const blob = new Blob(["hello"], { type: "text/plain" });
    const ref = await provider.upload(blob);
    expect(ref.url).toBe("javascript:alert(1)");
    expect(provider.resolve(ref)).toBe("javascript:alert(1)");
  });
});
