import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DATA_ATTRS } from "../utils/dataAttributes";

export function useOverlayLayout<T extends HTMLElement>(
	dependencies: readonly unknown[],
): {
	elementRef: React.RefObject<T | null>;
	rootElement: HTMLElement | null;
	layoutVersion: number;
} {
	const elementRef = useRef<T>(null);
	const [rootElement, setRootElement] = useState<HTMLElement | null>(null);
	const [layoutVersion, forceLayoutVersion] = useState(0);

	useLayoutEffect(() => {
		const nextRootElement = elementRef.current?.closest(
			`[${DATA_ATTRS.editorRoot}]`,
		) as HTMLElement | null;
		setRootElement(nextRootElement);
	}, []);

	useLayoutEffect(() => {
		forceLayoutVersion((version) => version + 1);
	}, dependencies);

	useEffect(() => {
		if (!rootElement) {
			return;
		}

		let frameId = 0;
		const ownerDocument = rootElement.ownerDocument;
		const defaultView = ownerDocument.defaultView;
		const scheduleLayout = () => {
			if (frameId !== 0) {
				return;
			}
			frameId = (defaultView ?? window).requestAnimationFrame(() => {
				frameId = 0;
				forceLayoutVersion((version) => version + 1);
			});
		};

		const observer = new MutationObserver(() => {
			scheduleLayout();
		});

		observer.observe(rootElement, {
			subtree: true,
			childList: true,
			characterData: true,
			attributes: true,
		});

		ownerDocument.addEventListener("scroll", scheduleLayout, true);
		defaultView?.addEventListener("resize", scheduleLayout);

		return () => {
			observer.disconnect();
			ownerDocument.removeEventListener("scroll", scheduleLayout, true);
			defaultView?.removeEventListener("resize", scheduleLayout);
			if (frameId !== 0) {
				(defaultView ?? window).cancelAnimationFrame(frameId);
			}
		};
	}, [rootElement]);

	return {
		elementRef,
		rootElement,
		layoutVersion,
	};
}
