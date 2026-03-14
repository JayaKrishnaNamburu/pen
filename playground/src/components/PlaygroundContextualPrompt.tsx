import { Pen } from "@pen/react";
import type { RefObject } from "react";

type PlaygroundContextualPromptProps = {
	viewportRef: RefObject<HTMLDivElement | null>;
};

export function PlaygroundContextualPrompt({
	viewportRef,
}: PlaygroundContextualPromptProps) {
	return (
		<Pen.AI.InlineSession
			asChild
			containerRef={viewportRef}
			mode="inserted"
		>
			<div className="playground-inline-session" />
		</Pen.AI.InlineSession>
	);
}
