// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ANNOUNCE_RATE_LIMIT_MS,
	createAnnouncer,
	type Announcer,
} from "../announcer";

const announcers: Announcer[] = [];

afterEach(() => {
	for (const announcer of announcers) {
		announcer.dispose();
	}
	announcers.length = 0;
	document.body.replaceChildren();
	vi.useRealTimers();
});

function mount(root?: ParentNode): Announcer {
	const announcer = createAnnouncer(root);
	announcers.push(announcer);
	return announcer;
}

function liveRegion(container: ParentNode = document.body): HTMLElement | null {
	return container.querySelector('[role="status"]');
}

describe("createAnnouncer (AX2)", () => {
	it("AX2: mounts one live region with role=status, aria-live=polite, aria-atomic=true", () => {
		mount();

		const region = liveRegion();
		expect(region).not.toBeNull();
		expect(region?.getAttribute("role")).toBe("status");
		expect(region?.getAttribute("aria-live")).toBe("polite");
		expect(region?.getAttribute("aria-atomic")).toBe("true");
		expect(document.body.querySelectorAll('[role="status"]').length).toBe(1);
	});

	it("AX2: live region is visually hidden", () => {
		mount();

		const region = liveRegion();
		expect(region?.style.position).toBe("absolute");
		expect(region?.style.width).toBe("1px");
		expect(region?.style.height).toBe("1px");
		expect(region?.style.overflow).toBe("hidden");
		expect(region?.style.clip).toMatch(/^rect\(/);
		expect(region?.style.whiteSpace).toBe("nowrap");
	});

	it("AX2: announce writes the message into the live region", () => {
		const announcer = mount();
		announcer.announce("Converted to heading");

		expect(liveRegion()?.textContent).toBe("Converted to heading");
	});

	it("AX2: assertive priority sets aria-live=assertive", () => {
		const announcer = mount();
		announcer.announce("Urgent", "assertive");

		expect(liveRegion()?.getAttribute("aria-live")).toBe("assertive");
		expect(liveRegion()?.textContent).toBe("Urgent");
	});

	it("AX2: rate-limits one announcement per key per 500ms", () => {
		vi.useFakeTimers();
		const announcer = mount();

		announcer.announce("3 blocks selected", "polite", "blockSelectionChanged");
		announcer.announce("4 blocks selected", "polite", "blockSelectionChanged");

		expect(liveRegion()?.textContent).toBe("3 blocks selected");

		vi.advanceTimersByTime(ANNOUNCE_RATE_LIMIT_MS - 1);
		expect(liveRegion()?.textContent).toBe("3 blocks selected");
	});

	it("AX2: latest announcement wins when the same key repeats inside the window", () => {
		vi.useFakeTimers();
		const announcer = mount();

		announcer.announce("3 blocks selected", "polite", "blockSelectionChanged");
		announcer.announce("4 blocks selected", "polite", "blockSelectionChanged");
		announcer.announce("5 blocks selected", "polite", "blockSelectionChanged");

		expect(liveRegion()?.textContent).toBe("3 blocks selected");

		vi.advanceTimersByTime(ANNOUNCE_RATE_LIMIT_MS);
		expect(liveRegion()?.textContent).toBe("5 blocks selected");
	});

	it("AX2: different keys are not rate-limited against each other", () => {
		const announcer = mount();

		announcer.announce("Streaming started", "polite", "streamingStarted");
		announcer.announce("2 blocks selected", "polite", "blockSelectionChanged");

		expect(liveRegion()?.textContent).toBe("2 blocks selected");
	});

	it("AX2: a key may announce again after 500ms", () => {
		vi.useFakeTimers();
		const announcer = mount();

		announcer.announce("first", "polite", "streamingStarted");
		vi.advanceTimersByTime(ANNOUNCE_RATE_LIMIT_MS);
		announcer.announce("second", "polite", "streamingStarted");

		expect(liveRegion()?.textContent).toBe("second");
	});

	it("AX2: optional root mounts the region on that parent", () => {
		const root = document.createElement("div");
		document.body.appendChild(root);

		mount(root);

		expect(liveRegion(root)).not.toBeNull();
		expect(liveRegion(document.body)).toBe(liveRegion(root));
		expect(root.querySelectorAll('[role="status"]').length).toBe(1);
	});

	it("AX2: dispose removes the live region and pending announcements", () => {
		vi.useFakeTimers();
		const announcer = mount();

		announcer.announce("3 blocks selected", "polite", "blockSelectionChanged");
		announcer.announce("4 blocks selected", "polite", "blockSelectionChanged");
		announcer.dispose();

		expect(liveRegion()).toBeNull();

		vi.advanceTimersByTime(ANNOUNCE_RATE_LIMIT_MS);
		expect(liveRegion()).toBeNull();
	});

	it("AX2: announce after dispose is a no-op", () => {
		const announcer = mount();
		announcer.dispose();
		announcer.announce("too late");

		expect(liveRegion()).toBeNull();
	});
});
