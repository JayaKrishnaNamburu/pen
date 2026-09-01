const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Host-owned motion preference. Smooth streaming is off when this matches. */
export function prefersReducedMotion(): boolean {
	return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function subscribePrefersReducedMotion(
	listener: (reduced: boolean) => void,
): () => void {
	const media = window.matchMedia(REDUCED_MOTION_QUERY);
	const onChange = () => {
		listener(media.matches);
	};
	media.addEventListener("change", onChange);
	return () => {
		media.removeEventListener("change", onChange);
	};
}
