import { expect } from "@playwright/test";
import { scenario } from "../src/scenario";

scenario(
	"S2 harness self-test: broken projector fails domMatchesAuthority",
	async (s) => {
		await s.load("hello-world");
		await s.installBrokenProjector();
		await expect(s.assert.domMatchesAuthority()).rejects.toThrow();
	},
);
