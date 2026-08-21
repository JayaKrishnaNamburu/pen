import { expect } from "@playwright/test";
import { scenario } from "../src/scenario";
import { sampleCaretPoints } from "../src/wave3Geometry";

scenario(
	"S2 harness self-test: broken projector fails domMatchesAuthority",
	async (s) => {
		await s.load("hello-world");
		await s.installBrokenProjector();
		await expect(s.assert.domMatchesAuthority()).rejects.toThrow();
	},
	{ axe: false },
);

scenario(
	"S2 harness self-test: geometry cache compare and overlay flush are wired",
	async (s) => {
		await s.load("hello-world");
		const blocks = await s.geometry.blocks();
		const points = sampleCaretPoints(blocks);
		await s.geometry.warm(points);
		const compare = await s.geometry.compare(points);
		expect(compare.staleCount).toBe(0);
		expect(compare.compares.length).toBeGreaterThan(0);

		const carets = points.slice(0, 8).map((point) => ({
			blockId: point.blockId,
			offset: point.offset,
		}));
		const budget = await s.geometry.flushEightRemoteCarets(carets);
		expect(budget.readPhase).toBe("read");
		expect(budget.writePhase).toBe("write");
		expect(budget.paintedCount).toBeGreaterThan(0);
	},
	{ axe: false },
);
