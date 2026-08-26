import { useEffect, useRef, useState, type ReactNode } from "react";

/** Close enough to the bottom to count as "following along". */
const NEAR_BOTTOM_PX = 16;

interface ScrollAreaProps {
	children: ReactNode;
	/**
	 * Follows content as it grows — but only while the reader is already at the
	 * bottom, so scrolling up to re-read something is never yanked back.
	 */
	autoScroll?: boolean;
}

/**
 * A scrolling region that fades its clipped edges, ported from Input's
 * `AgentStreamingScrollBox`.
 *
 * The fades are the whole point: without them a cut-off line looks like the end
 * of the list. They appear only on the side there is more content on, which is
 * why this needs a scroll listener rather than being pure CSS.
 */
export function ScrollArea({ children, autoScroll }: ScrollAreaProps) {
	const viewportRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const isFollowingRef = useRef(true);
	const [hasTopFade, setHasTopFade] = useState(false);
	const [hasBottomFade, setHasBottomFade] = useState(false);

	useEffect(() => {
		const viewport = viewportRef.current;
		const content = contentRef.current;
		if (!viewport || !content) {
			return;
		}

		const sync = () => {
			const distanceToBottom =
				viewport.scrollHeight -
				(viewport.scrollTop + viewport.clientHeight);
			const isAtBottom = distanceToBottom <= NEAR_BOTTOM_PX;

			isFollowingRef.current = isAtBottom;
			setHasTopFade(viewport.scrollTop > 0);
			setHasBottomFade(!isAtBottom);
		};

		// The content box changes size as turns arrive or blocks are added; the
		// viewport itself does not, so observe the content.
		const observer = new ResizeObserver(() => {
			if (autoScroll && isFollowingRef.current) {
				viewport.scrollTop = viewport.scrollHeight;
			}
			sync();
		});

		observer.observe(content);
		viewport.addEventListener("scroll", sync, { passive: true });
		sync();

		return () => {
			observer.disconnect();
			viewport.removeEventListener("scroll", sync);
		};
	}, [autoScroll]);

	return (
		<div
			className="scroll-area"
			data-fade-top={hasTopFade || undefined}
			data-fade-bottom={hasBottomFade || undefined}
		>
			<div className="scroll-viewport" ref={viewportRef}>
				<div ref={contentRef}>{children}</div>
			</div>
		</div>
	);
}
