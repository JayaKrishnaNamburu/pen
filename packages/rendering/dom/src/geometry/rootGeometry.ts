import { DomScheduler } from "../scheduler";
import { DATA_ATTRS } from "../utils/dataAttributes";
import {
	createGeometryReader,
	type GeometryReaderHost,
	type GeometryReaderOptions,
} from "./geometryReader";

export type RootGeometry = {
	readonly root: HTMLElement;
	readonly scheduler: DomScheduler;
	readonly reader: GeometryReaderHost;
};

const hosts = new WeakMap<HTMLElement, RootGeometry>();
let rootSeq = 0;

/**
 * One GeometryReader + DomScheduler per editor root (SCH3).
 * First call wins for reader options; later calls reuse the host.
 */
export function getRootGeometry(
	root: HTMLElement,
	options?: Omit<GeometryReaderOptions, "root">,
): RootGeometry {
	const existing = hosts.get(root);
	if (existing) {
		return existing;
	}

	const reader = createGeometryReader({
		root,
		observeResize: options?.observeResize ?? true,
		observeFonts: options?.observeFonts ?? true,
		observeScroll: options?.observeScroll ?? true,
		...options,
	});
	const scheduler = new DomScheduler(rootIdFor(root), { geometry: reader });
	const host = { root, scheduler, reader };
	hosts.set(root, host);
	return host;
}

/**
 * Run `fn` against the per-root reader. Uses the current read phase when
 * already flushing; otherwise `measureNow` (SCH2) because the callers of
 * this helper still need a synchronous value.
 */
export function measureWithRoot<T>(
	root: HTMLElement,
	fn: (host: RootGeometry) => T,
): T {
	const host = getRootGeometry(root);
	if (host.scheduler.phase === "read") {
		return fn(host);
	}
	return host.scheduler.measureNow(() => fn(host));
}

function rootIdFor(root: HTMLElement): string {
	return root.getAttribute(DATA_ATTRS.viewId) ?? `geometry-root-${++rootSeq}`;
}
