import { describe, expect, it } from "vitest";
import { memoryAssets } from "../index.js";

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

  it("calls onProgress with 1", async () => {
    const provider = memoryAssets();
    const blob = new Blob(["hello"], { type: "text/plain" });
    let progress: number | undefined;
    await provider.upload(blob, {
      onProgress: (p) => {
        progress = p;
      },
    });
    expect(progress).toBe(1);
  });
});
